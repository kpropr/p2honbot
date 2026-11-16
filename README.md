# PETUHON EMPIRE 🐓

Telegram Mini App: зерновой кликер, энергия, улучшения, пять бизнесов, три курочки с 15 сюжетными свиданиями и настоящий рейтинг PostgreSQL.

## Стек и устройство

React/TypeScript/Vite; Fastify/Node.js 22; PostgreSQL 16. `shared/catalog.ts` содержит баланс и истории; `server/game.ts` — серверные правила. Бот работает отдельным процессом через long polling. WebSocket и Redis не требуются.

Вся экономика авторитетна на сервере. Клиент анимирует клики и отправляет до 10 кликов пакетом раз в секунду. Сервер ограничивает скорость token bucket (10/сек, всплеск 10), проверяет энергию и блокирует строку игрока на время транзакции. Полной защиты от автокликеров это не даёт.

Энергия и пассивный доход рассчитываются по серверному времени при обращении. Лимит офлайн-дохода — 8 часов. Дробные зёрна сохраняются в состоянии, отображается целая часть. В рейтинг попадает начисленный доход; отсутствующий игрок получит накопленное при следующем входе. Покупки рейтинг не уменьшают.

Каждая мутация имеет UUID и время выдачи, взятое из последнего серверного состояния. Повторы в течение 24 часов безопасны; журнал операций сохраняется 48 часов. Просроченные операции отклоняются и не начисляются заново. При закрытии приложения неподтверждённые клики могут потеряться; клиент не обещает сохранение до ответа сервера.

## Локальная разработка

```sh
npm ci
npm test
npm run build
```

Создать PostgreSQL, задать переменные из `.env.example`, выполнить `npm run migrate`. Node не загружает `.env` автоматически: использовать `node --env-file=.env build/server/index.js` либо передавать переменные окружения. Во втором терминале запустить `npm run dev`. Для Telegram нужен HTTPS и настоящий подписанный `initData`. Вне Telegram отображается приглашение открыть бота; обхода авторизации в production нет.

Для разработки через Vite задать `NODE_ENV=development`, `PUBLIC_URL=http://localhost:5173/play/`. Секреты, локальные сборки и тестовые артефакты исключены из Git.

## API

Все маршруты под `/play/api/`. `POST auth` принимает `{initData}`, проверяет HMAC и свежесть (1 час), выдаёт HttpOnly/Secure/SameSite=Strict cookie на 7 дней. Идентификатор игрока клиент не задаёт. `GET state`, `catalog`, `leaderboard` требуют сессию; `GET health` проверяет БД.

`POST action`: `{operationId, issuedAt, kind, ...}`. Виды: `click` (`count`), `upgrade`/`business`/`partner` (`id`), `gift` (`id`, `gift`), `date` (`id`, `date`, `step`, `choice`). Ответ содержит подтверждённое состояние, принятую часть кликов или текст ответа NPC. Ошибки 401 — вход, 409 — игровое ограничение, 429 — частота, 5xx — временный сбой. Цены и награды клиентом не передаются.

## Размещение на собственном сервере

Для запуска нужны Docker Compose, домен с HTTPS и токен Telegram-бота. Приложение публикуется на loopback-порту 8081; PostgreSQL доступен только во внутренней сети Docker. Включите `deploy/nginx-location.conf` в подходящий HTTPS server-блок вашего Nginx.
1. Установить Docker и Compose. Локально собрать `npm ci && npm run build`.
2. Передать `build/`, `dist/`, `package*.json`, `Dockerfile.release`, `.dockerignore`, `compose.yaml`, `deploy/` в `/opt/petuhon`.
3. На сервере выполнить `PUBLIC_URL=https://example.com/play/ python3 deploy/prepare-env.py`. Пароль БД генерируется автоматически, `.env` имеет права 600. Добавить токен бота в `BOT_TOKEN` без публикации в Git/чат.
4. Выполнить `docker compose build app`, `docker compose up -d db`, `docker compose run --rm app node build/server/migrate.js`, `docker compose up -d app`.
5. Добавить `include /opt/petuhon/deploy/nginx-location.conf;` в HTTPS server-блок Nginx. Сохранить резервную копию конфигурации, проверить `nginx -t`, затем выполнить `systemctl reload nginx`. Не изменять маршруты других приложений.
6. После установки токена: `docker compose --profile bot up -d bot`. Для бота с существующим webhook сначала решить, какой обработчик оставить: long polling не работает одновременно с webhook.
7. В BotFather можно дополнительно настроить Main Mini App на `https://example.com/play/`. Кнопку меню и `/start` настраивает процесс бота.

## Резервирование и обновления

`bash /opt/petuhon/deploy/backup.sh` создаёт сжатый `pg_dump` в `/opt/petuhon-backups` с правами 600. Ежедневный запуск через `/etc/cron.d/petuhon-backup`; время cron соответствует часовому поясу VPS. Копии старше 7 дней удаляются. Регулярно копировать резервные файлы на другой компьютер/хранилище: локальная копия не защищает от потери VPS.

Проверка восстановления без воздействия на рабочую БД:

```sh
docker compose exec -T db createdb -U petuhon petuhon_restore_check
gzip -dc /opt/petuhon-backups/ИМЯ.sql.gz | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U petuhon -d petuhon_restore_check
docker compose exec -T db psql -U petuhon -d petuhon_restore_check -c 'SELECT count(*) FROM players;'
```

Перед обновлением: сделать backup, сохранить прежний образ `docker tag petuhon-empire:latest petuhon-empire:previous`, передать новую сборку, собрать образ, выполнить миграции и `docker compose up -d app`. Бота пересоздать только при изменениях его кода/окружения. Откат совместимого кода: `APP_VERSION=previous docker compose up -d app`; изменения схемы требуют отдельного плана восстановления, не удалять volume. Не использовать `docker compose down -v` для обновления.

Проверки: `curl -f https://example.com/play/api/health`, `docker compose ps`, `docker stats --no-stream`, `docker compose logs --tail=100 app`. Логи ротируются, контейнеры перезапускаются после завершения процесса. Healthcheck сам по себе не перезапускает зависшее приложение: unhealthy требует вмешательства или внешнего мониторинга.

## Тесты

`npm test` запускает тесты экономики и авторизации; интеграционный тест включается только при `RUN_DB_TESTS=1`, `NODE_ENV=test`, и DATABASE_URL с отдельной БД `petuhon_test`. Он очищает **только тестовую базу**.

`npx tsc -p tsconfig.tests.json` компилирует тесты в `artifacts/test-build`. `deploy/verify.py` на VPS запускает интеграционные проверки и изолированный API на 127.0.0.1:8082. `deploy/load-test.mjs` создаёт 50 игроков только на этом API; для запуска обязательна переменная `LOAD_TEST_ISOLATED=yes`. Тестовый API остановить после проверки. Рабочая база остаётся без демонстрационных аккаунтов.
