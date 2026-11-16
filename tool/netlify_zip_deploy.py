#!/usr/bin/env python3
"""把站点根打成 zip，通过 Netlify digest API 部署，拉取部署日志。

用法:
  python3 tool/netlify_zip_deploy.py --site morediscord \
    --source /path/to/site-root --zip out.zip --log out.log

环境变量: NETLIFY_AUTH_TOKEN
退出码: 0=部署成功, 1=失败
"""
import argparse
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import zipfile

API = "https://api.netlify.com/api/v1"


def api(method, path, token, body=None, raw=None, headers=None):
    h = {"Authorization": f"Bearer {token}"}
    if headers:
        h.update(headers)
    data = None
    if raw is not None:
        data = raw
    elif body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{API}/{path}", method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            text = r.read().decode("utf-8", "replace")
            try:
                return json.loads(text)
            except Exception:
                return text
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}", file=sys.stderr)
        raise


def git_blob_sha(data: bytes) -> str:
    """Netlify digest 用 git blob SHA1。"""
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\x00" + data).hexdigest()


def collect_files(root):
    out = {}
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("node_modules", ".git")]
        for name in files:
            p = os.path.join(base, name)
            rel = "/" + os.path.relpath(p, root).replace(os.sep, "/")
            out[rel] = open(p, "rb").read()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", default="morediscord")
    ap.add_argument("--source", required=True)
    ap.add_argument("--zip", required=True)
    ap.add_argument("--log", required=True)
    args = ap.parse_args()

    token = os.environ.get("NETLIFY_AUTH_TOKEN", "")
    if not token:
        print("NETLIFY_AUTH_TOKEN 未设置", file=sys.stderr)
        return 1

    files = collect_files(args.source)
    print(f"站点文件: {len(files)} 个")

    # 1. 打 zip（供 Release 用）
    with zipfile.ZipFile(args.zip, "w", zipfile.ZIP_DEFLATED) as z:
        for rel, data in files.items():
            z.writestr(rel.lstrip("/"), data)
    print(f"zip 已生成: {args.zip} ({os.path.getsize(args.zip)} bytes)")

    # 2. 找站点
    sites = api("GET", "sites", token)
    site = next((s for s in sites if s["name"] == args.site), None)
    if not site:
        print(f"站点 {args.site} 不存在或 token 不可见", file=sys.stderr)
        return 1
    sid = site["id"]

    # 3. digest deploy
    digests = {rel: git_blob_sha(data) for rel, data in files.items()}
    result = api("POST", f"sites/{sid}/deploys", token,
                 {"files": digests})
    did = result["id"]
    required = result.get("required", [])
    print(f"deploy {did[:10]} 创建，需要上传 {len(required)} 个文件")

    # 4. 上传缺失文件
    sha_to_rel = {}
    for rel, sha in digests.items():
        sha_to_rel.setdefault(sha, rel)
    for sha in required:
        rel = sha_to_rel.get(sha)
        if not rel:
            print(f"  警告: 找不到 sha {sha[:10]} 对应的本地文件", file=sys.stderr)
            continue
        # digest 里 key 是 "/index.html"，上传路径是 /deploys/{id}/files/index.html
    # 用 quote 逐段转义（保留 /），避免整体转义把斜杠变成 %2F
    encoded = "/".join(urllib.parse.quote(seg, safe="~") for seg in rel.lstrip("/").split("/"))
    api("PUT", f"deploys/{did}/files/{encoded}", token, raw=files[rel],
        headers={"Content-Type": "application/octet-stream"})
    print("文件上传完成")

    # 5. 等部署完成
    state = "unknown"
    for _ in range(60):
        d = api("GET", f"deploys/{did}", token)
        state = d.get("state")
        if state in ("ready", "error", "canceled"):
            break
        time.sleep(5)
    print(f"最终状态: {state}")

    # 6. 拉日志
    try:
        log = api("GET", f"deploys/{did}/log", token)
        text = log.get("log", "") if isinstance(log, dict) else str(log)
    except Exception as e:
        text = f"日志拉取失败: {e}"
    with open(args.log, "w") as f:
        f.write(f"site={args.site} deploy={did} state={state}\n")
        f.write(text)
    errs = [ln for ln in text.split("\n")
            if any(k in ln.lower() for k in ("error", "failed", "not found", "eexit"))]
    print("---- 日志错误行 ----")
    for ln in errs[-20:]:
        print(" ", ln[:250])

    return 0 if state == "ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
