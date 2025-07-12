# Use official Motoko base image (можно поменять)
FROM dfinity/moc-base:latest

# Установим DFX CLI
RUN apt-get update && \
    apt-get install -y curl git build-essential && \
    sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"

# Копируем всё
WORKDIR /app
COPY . .

# Собираем канистры
RUN dfx build

# Дефолтная команда
CMD ["dfx", "start", "--background"]
