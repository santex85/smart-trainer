# Цикл разработки: Dev → тест → merge → Production

Опишем, как вести разработку в ветке `dev`, тестировать на dev-сервере и выкатывать в прод через `main`.

## Схема

```
ветка dev  →  пуш  →  dev-сервер (dev.tsspro.tech)  →  тест
                                                           ↓
ветка main  ←  merge  ←  после успешного теста
     ↓
production (tsspro.tech)  ←  make deploy
```

## 1. Создать и вести ветку dev

Один раз создать ветку (если ещё нет):

```bash
git checkout main
git pull origin main
git checkout -b dev
git push -u origin dev
```

Дальше всю новую разработку делаем в `dev`:

```bash
git checkout dev
git pull origin dev
# правки, коммиты
git add .
git commit -m "feat: ..."
```

## 2. Выкатить на dev-сервер и тестировать

Из ветки `dev` (или любой текущей ветки) с локальной машины:

```bash
make deploy-dev
```

Что происходит: пуш текущей ветки в `origin`, на dev-сервере (209.38.17.171) делаются `git fetch`, `checkout` этой ветки, `git pull`, сборка образов, `docker stack deploy`, миграции Alembic.

- Без пуша (код уже запушен, нужно только пересобрать на сервере):  
  `make deploy-dev-no-push`

После деплоя проверяем: https://dev.tsspro.tech — логин, новые фичи, API.

Логи на dev-сервере:

```bash
ssh root@209.38.17.171
docker service logs st2_backend -f
docker service logs st2_frontend -f
docker service logs st2_caddy -f
```

## 3. После успешного теста — merge в main и деплой в production

Когда на dev всё ок:

```bash
git checkout main
git pull origin main
git merge dev
git push origin main
make deploy
```

`make deploy` пушит `main` и на production-сервере (167.71.74.220) выполняет `git pull`, сборку, `stack deploy`, миграции. Итог: https://tsspro.tech обновлён.

Дальше продолжаем в `dev`:

```bash
git checkout dev
git merge main   # подтянуть актуальный main при необходимости
```

## Краткая шпаргалка по командам

| Действие | Команда |
|----------|--------|
| Деплой текущей ветки на dev (с пушем) | `make deploy-dev` |
| Деплой текущей ветки на dev (без пуша) | `make deploy-dev-no-push` |
| Деплой main на production | `make deploy` |
| Только действия на сервере (prod, без пуша) | `make deploy-no-push` |

Убедись, что на dev деплоишь из ветки `dev` (`git branch --show-current` = dev), а в прод пушишь только после merge в `main`.

## Первый запуск dev-сервера

Если dev-сервер ещё не настроен:

1. DNS: A-запись **dev.tsspro.tech** → **209.38.17.171**.
2. С локальной машины: `make bootstrap-dev` (один раз: Docker, Swarm, каталог).
3. На сервере положить `.env` (скопировать с примера и заполнить секреты, `DOMAIN=dev.tsspro.tech`, `STRAVA_REDIRECT_URI=https://dev.tsspro.tech/...`). Либо скопировать свой `.env.dev` на сервер в `/root/smart_trainer/.env`.
4. Дальше: работа в ветке `dev` и `make deploy-dev` / `make deploy-dev-no-push`.

Подробнее: [deploy/README-dev.md](../deploy/README-dev.md).
