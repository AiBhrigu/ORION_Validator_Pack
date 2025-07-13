#!/bin/bash
echo "🚀 Installing ORION Validator Pack..."

# Установить DFX если не установлен
if ! [ -x "$(command -v dfx)" ]; then
  echo "📥 Installing DFX..."
  sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
fi

# Загрузить зависимости (если будут)
# npm install  # если появятся js тесты

# Запустить локальную сеть и развернуть
dfx start --background
dfx deploy

echo "✅ Done! ORION Validator Pack is ready!"
