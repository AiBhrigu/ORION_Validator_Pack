# Используем официальный DFINITY образ или Ubuntu + DFX
FROM dfinity/dfx:latest

# Установить рабочую директорию
WORKDIR /app

# Копировать всё внутрь контейнера
COPY . .

# Запустить установку
RUN bash install.sh

# Экспонируем порт DFX
EXPOSE 8000

# Команда по умолчанию
CMD ["dfx", "start", "--background"] && ["dfx", "deploy"] && tail -f /dev/null
