#!/usr/bin/env python3
"""检查仓库内不允许出现的 emoji 字符。

规则：禁止 Emoji Presentation 的字符（U+1F000–U+1FAFF、U+2600–U+27BF 等）。
允许：CJK、全角标点（…—×•●）、箭头（→）等普通排版符号。
用法：python3 tool/check_emoji.py [根目录]
退出码：0 = 通过，1 = 发现 emoji
"""
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
SKIP_DIRS = {"node_modules", ".git", "dist", ".next", "build"}
# 审查报告/任务书是历史记录，不属于产品代码，其中的对勾不算 UI emoji
SKIP_FILES = {"AUDIT_BACKEND.md", "AUDIT_FRONTEND.md", "AUDIT_BACKEND2.md",
              "AUDIT_FRONTEND2.md", "AUDIT_CONTRACT.md", "FIX_PLAN.md",
              "LAYER_PLAN.md", "FULLCHECK_TASK.md", "PASSWORDLESS_TASK.md",
              "TRANSLATE_TASK.md"}
EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".md", ".sql", ".yml", ".yaml",
        ".json", ".html", ".css", ".txt", ".toml")

EMOJI = re.compile(
    "["
    "\U0001F000-\U0001FAFF"   # 各类 emoji
    "\U0001F1E6-\U0001F1FF"   # 区域指示符
    "☀-➿"              # 杂项符号与 pictographs
    "⬀-⯿"              # 杂项符号扩展
    "️"                        # 变体选择符
    "]"                # 键帽
)


def main() -> int:
    hits = []
    for root, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for name in files:
            if not name.endswith(EXTS) or name in SKIP_FILES:
                continue
            path = os.path.join(root, name)
            try:
                text = open(path, encoding="utf-8").read()
            except (OSError, UnicodeDecodeError):
                continue
            for i, line in enumerate(text.split("\n"), 1):
                for m in EMOJI.finditer(line):
                    hits.append(f"{path}:{i}: U+{ord(m.group()):04X} {m.group()!r}")
    if hits:
        print("发现 emoji：")
        for h in hits:
            print(" ", h)
        return 1
    print("emoji check: clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
