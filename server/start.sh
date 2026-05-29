#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  Shopee Aff Tool — Script khởi động server
#  Lần sau chỉ cần gõ: shopee
# ============================================================

cd "$HOME/shopee-aff-tool/server"

# Kiểm tra file .env
if [ ! -f ".env" ]; then
  echo "Chưa cài đặt! Chạy install.sh trước."
  exit 1
fi

echo "Khởi động Shopee Aff Server..."
node server.js &
SERVER_PID=$!

# Đợi server khởi động
sleep 2

echo "Mở tunnel cloudflared..."
# Lưu URL tunnel vào file để web đọc
cloudflared tunnel --url http://localhost:3000 2>&1 | tee /tmp/cf.log | while read line; do
  echo "$line"
  # Phát hiện URL tunnel và lưu lại
  if echo "$line" | grep -q "trycloudflare.com"; then
    URL=$(echo "$line" | grep -o 'https://[a-z0-9-]*\.trycloudflare.com')
    if [ -n "$URL" ]; then
      echo "$URL" > /tmp/tunnel_url.txt
      echo ""
      echo "=============================="
      echo " Server đang chạy!"
      echo " URL: $URL"
      echo " Gửi URL này cho nhóm dùng"
      echo "=============================="
    fi
  fi
done

# Tắt server khi cloudflared dừng
kill $SERVER_PID 2>/dev/null
