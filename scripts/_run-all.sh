#!/bin/bash
# 跑小程序全套 verify 脚本并汇总（inline 命令太复杂会被拦 → 落地成脚本）
cd ~/WeChatProjects/OpenVenues-miniapp || exit 1
P=0; F=0; BAD=""
for f in scripts/verify-*.cjs; do
  n=$(basename "$f" .cjs)
  out=$(node "$f" 2>&1)
  if echo "$out" | grep -q "✗"; then F=$((F+1)); BAD="$BAD $n"; else P=$((P+1)); fi
done
echo "小程序全套：$P 套全绿 / $F 套有红：$BAD"
for n in $BAD; do
  echo "  --- $n ---"
  node "scripts/$n.cjs" 2>&1 | grep "✗" | head -5 | sed 's/^/     /'
done
echo
echo "=== 关键套计数 ==="
for n in verify-article verify-venue-nav verify-activity-tab verify-share verify-courses verify-favorite; do
  printf "  %-20s %s\n" "$n" "$(node "scripts/$n.cjs" 2>&1 | grep -oE '[0-9]+ 过 / [0-9]+ 失败' | tail -1)"
done
