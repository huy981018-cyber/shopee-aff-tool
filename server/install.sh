#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  Shopee Aff Tool — Script cài đặt lần đầu
#  Chạy 1 lần duy nhất: curl -sL https://raw.githubusercontent.com/huy981018-cyber/shopee-aff-tool/main/server/install.sh | bash
# ============================================================

set -e
echo "=============================="
echo " Shopee Aff Tool — Cài đặt"
echo "=============================="

# Cài dependencies nếu chưa có
echo "[1/4] Cài Node.js và git..."
pkg install nodejs git -y 2>/dev/null

# Clone repo
echo "[2/4] Tải source code..."
if [ -d "$HOME/shopee-aff-tool" ]; then
  cd "$HOME/shopee-aff-tool" && git pull
else
  git clone https://github.com/huy981018-cyber/shopee-aff-tool.git "$HOME/shopee-aff-tool"
fi

# Cài npm packages
echo "[3/4] Cài packages..."
cd "$HOME/shopee-aff-tool/server"
npm install

# Nhập thông tin đăng nhập lần đầu
echo "[4/4] Nhập thông tin đăng nhập Shopee Affiliate..."
echo ""
echo "Nhập username (email/số điện thoại):"
read SHOPEE_USER
echo "Nhập mật khẩu:"
read -s SHOPEE_PASS

# Lưu vào file .env
cat > "$HOME/shopee-aff-tool/server/.env" << EOF
SHOPEE_USER=$SHOPEE_USER
SHOPEE_PASS=$SHOPEE_PASS
PORT=3000
EOF

echo ""
echo "=============================="
echo " Cài đặt xong!"
echo " Chạy server: shopee"
echo "=============================="

# Tạo alias để lần sau chỉ cần gõ "shopee"
echo 'alias shopee="cd $HOME/shopee-aff-tool/server && bash start.sh"' >> "$HOME/.bashrc"
source "$HOME/.bashrc" 2>/dev/null || true

echo "Khởi động server ngay bây giờ? (y/n)"
read START_NOW
if [ "$START_NOW" = "y" ]; then
  bash "$HOME/shopee-aff-tool/server/start.sh"
fi
