#!/usr/bin/env bash
# ============================================================================
# Phơi AICORP ra internet qua Cloudflare Tunnel, CÓ mật khẩu bảo vệ (Basic Auth).
# App vẫn chạy 100% trên máy bạn; Cloudflare chỉ tạo một URL công khai proxy về.
#
# Yêu cầu: đã cài cloudflared  ->  brew install cloudflared
# Dùng:    bash scripts/share-online.sh
#          (Ctrl+C để dừng: tắt cả tunnel lẫn server)
#
# LƯU Ý BẢO MẬT: ai có URL + mật khẩu đều điều khiển được công ty AI và TIÊU
# hạn mức Claude của bạn. Giữ mật khẩu riêng tư; tắt tunnel khi không dùng.
# URL dạng *.trycloudflare.com là TẠM THỜI — đổi mỗi lần chạy. Muốn URL cố định
# cần tài khoản Cloudflare + tên miền + named tunnel.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3939}"

command -v cloudflared >/dev/null 2>&1 || { echo "❌ Chưa có cloudflared. Cài: brew install cloudflared"; exit 1; }

# Mật khẩu: lấy từ biến môi trường nếu có, không thì tạo ngẫu nhiên 16 ký tự.
PASS="${AICORP_PASSWORD:-$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 16)}"

echo "🔑 Đăng nhập:  user = admin (bất kỳ)   |   mật khẩu = $PASS"
echo "⏳ Khởi động server (dữ liệu ~/AICORP, có mật khẩu)…"

# Dừng server cũ trên cổng (nếu có) rồi chạy lại kèm mật khẩu.
lsof -ti tcp:"$PORT" | xargs kill 2>/dev/null || true
sleep 1
AICORP_PASSWORD="$PASS" AICORP_NO_OPEN=1 PORT="$PORT" node server/index.js > /tmp/aicorp-online.log 2>&1 &
SERVER_PID=$!
trap 'echo; echo "🛑 Đang dừng…"; kill $SERVER_PID 2>/dev/null || true' EXIT INT TERM

for i in $(seq 1 25); do
  curl -s -o /dev/null "http://localhost:$PORT/" 2>/dev/null && break
  sleep 1
done
echo "✅ Server sẵn sàng. 🌐 Mở Cloudflare Tunnel (URL công khai hiện bên dưới):"
echo "----------------------------------------------------------------------"
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate
