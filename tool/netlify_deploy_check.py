#!/usr/bin/env python3
"""查询 Netlify 站点最新部署状态；失败则拉取日志并打印错误行。
用法: NETLIFY_AUTH_TOKEN=xxx python3 tool/netlify_deploy_check.py [site_name]
"""
import json
import os
import sys
import urllib.request

TOKEN = os.environ.get("NETLIFY_AUTH_TOKEN", "")
SITE = sys.argv[1] if len(sys.argv) > 1 else "morediscord"
HEAD = {"Authorization": f"Bearer {TOKEN}"}


def api(path):
    req = urllib.request.Request(f"https://api.netlify.com/api/v1/{path}", headers=HEAD)
    return json.load(urllib.request.urlopen(req, timeout=20))


def main() -> int:
    if not TOKEN:
        print("NETLIFY_AUTH_TOKEN 未设置，跳过部署检查")
        return 0
    sites = api("sites")
    site = next((s for s in sites if s["name"] == SITE), None)
    if not site:
        print(f"站点 {SITE} 不在该 token 可见范围（跳过）")
        return 0
    sid = site["id"]
    deploys = api(f"sites/{sid}/deploys?per_page=1")
    if not deploys:
        print("无部署记录")
        return 0
    d = deploys[0]
    state = d.get("state")
    print(f"站点 {SITE} 最新部署: {d['id'][:10]} state={state} created={d.get('created_at')}")
    if state == "ready":
        print("部署成功")
        return 0
    if state in ("building", "enqueued", "uploading"):
        print(f"部署进行中 ({state})，等待下次检查")
        return 2  # 让 CI 的轮询循环继续等
    # 失败态：拉日志
    log_url = d.get("deploy_log_url") or f"{d['id']}/log"
    try:
        if d.get("deploy_log_url"):
            req = urllib.request.Request(d["deploy_log_url"], headers=HEAD)
            log = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
        else:
            log = json.dumps(api(f"deploys/{d['id']}/log"))
    except Exception as e:
        print(f"日志拉取失败: {e}")
        return 0 if state == "building" else 1
    errors = [ln for ln in log.split("\n")
              if any(k in ln.lower() for k in ("error", "failed", "not found", "cannot", "eexit"))]
    print("---- 部署日志错误行 ----")
    for ln in errors[-30:]:
        print(" ", ln[:300])
    return 0 if state == "building" else 1


if __name__ == "__main__":
    raise SystemExit(main())
