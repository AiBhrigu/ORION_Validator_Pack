# 🚀 ORION Validator Pack

**ORION Validator Pack** — это готовый пакет для запуска и поддержки кастомного валидатора в сети ICP с интеграцией Governance и BRI Token.

---

## 📌 Состав проекта

- **`src/bri-token-backend/`** — Canister с логикой токена BRI
- **`src/bhrigu_governance_backend/`** — Governance Canister для управления
- **`install.sh`** — Скрипт быстрой установки и деплоя
- **`Dockerfile` / `docker-compose.yml`** — Контейнеризация для быстрого старта
- **`.github/workflows/ci.yml`** — Авто CI для проверки кода и сборки
- **`tests/`** — Тесты (плейсхолдер — расширяйте!)

---

## ⚙️ Быстрый старт

```bash
git clone https://github.com/AiBhrigu/ORION_Validator_Pack.git
cd ORION_Validator_Pack

# Запуск локального ICP нода
dfx start --background

# Сборка и деплой всех канистер
dfx deploy

# Запуск тестов
npm install
npm test
