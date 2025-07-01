# Frontend Application README

Цей файл містить інструкції для запуску та налаштування фронтенд-частини застосунку.

## Prerequisites

- Node.js (>=16)
- npm або yarn
- Backend має бути запущений за адресою http://localhost:8000

## Інсталяція

```bash
# Клонувати репозиторій (якщо ще не зробили)
git clone <your-repo-url>
cd <your-frontend-folder>

# Встановити залежності
npm install
# або
yarn install
```

## Налаштування

Створіть файл `.env` у корені фронтенду з наступними змінними:

```dotenv
REACT_APP_API_URL=http://localhost:8000
```

За потреби змініть URL на адресу вашого бекенду.

## Запуск в режимі розробки

```bash
npm start
# або
yarn start
```

Відкриється сторінка за замовчуванням у браузері: http://localhost:3000.

## Збірка для продакшн

```bash
npm run build
# або
yarn build
```

Згенерована папка `build/` містить готовий продакшн-білд.

## Використані технології

- React (Hooks)
- Material UI
- AWS Chime SDK via FastAPI backend
- Fetch API для взаємодії з сервером

## Основні команди

- `npm start` — запуск у режимі розробки
- `npm run build` — збірка для продакшн
- `npm test` — запуск тестів (якщо додані)
- `npm lint` — перевірка стилю коду

## Формат та структура

```
src/
├── App.js                # Головний компонент
├── App.css               # Стилі (за потреби можна змінити MUI theme)
├── components/           # Додаткові компоненти
├── hooks/                # Кастомні React Hooks
└── utils/                # Утиліти (наприклад API клієнт)
```

## Розгортання

1. Виконайте `npm run build`.
2. Скопіюйте вміст папки `build/` на ваш статичний хостинг (S3, Netlify, Vercel тощо).
3. Переконайтеся, що змінна `REACT_APP_API_URL` вказує на правильний бекенд.

---

> Питання та пропозиції — у розділі Issues репозиторію.
