/**
 * UI strings — single locale (Russian) for consistent interface.
 * Keys can be reused for en.ts when adding language switch.
 */
export const ru = {
  app: {
    loading: "Загрузка…",
    brandTitle: "Smart Trainer",
    brandSubtitle: "Питание, сон и тренировки в одном месте",
    logout: "Выйти",
  },
  tabs: {
    home: "Главная",
    chat: "Чат",
    profile: "Профиль",
  },
  today: "Сегодня",
  yesterday: "Вчера",
  tomorrow: "Завтра",
  auth: {
    login: "Войти",
    password: "Пароль",
    passwordHint: "Пароль (не менее 6 символов)",
    passwordMinLength: "Пароль не менее 6 символов",
    emailRequired: "Введите email и пароль",
    haveAccount: "Уже есть аккаунт? Войти",
    requestError: "Ошибка запроса. Повторите позже.",
  },
  nutrition: {
    title: "Питание (остаток по целям)",
    eaten: "Съедено",
    left: "Осталось",
    kcal: "ккал",
    proteinShort: "Б",
    fatShort: "Ж",
    carbsShort: "У",
    grams: "г",
    goal: "Цель",
    caloriesLabel: "Ккал",
    proteinLabel: "Белки",
    fatLabel: "Жиры",
    carbsLabel: "Углеводы",
    placeholder: "Отмечайте приёмы пищи камерой →",
    loadError: "Не удалось загрузить питание. Потяните для обновления.",
    copy: "Копировать",
  },
  wellness: {
    title: "Сон и здоровье",
    edit: "Изменить",
    hint: "Сегодня. Данные хранятся в БД и учитываются ИИ при анализе и в чате.",
    sleep: "Сон",
    sleepHours: "ч",
    weight: "Вес",
    weightKg: "кг",
    manualHint: "Введите сон вручную (Изменить) или загрузите фото сна через камеру.",
    placeholder: "Нажмите «Изменить», чтобы ввести сон, RHR, HRV и вес.",
  },
  fitness: {
    title: "Фитнес (CTL / ATL / TSB)",
    hint: "По TSS из тренировок. Подключите Intervals.icu для планов и синхронизации.",
    dateLabel: "На дату",
    fromWellness: "Из wellness. Добавляйте тренировки для расчёта по TSS.",
    placeholder: "Добавляйте тренировки вручную или загружайте FIT — CTL/ATL/TSB посчитаются по TSS.",
  },
  workouts: {
    title: "Тренировки",
    uploadFit: "Загрузить FIT",
    add: "+ Добавить",
    hint: "Последние 14 дней · ручной ввод, FIT и Intervals.icu",
  },
  camera: {
    portion: "Порция",
  },
  fit: {
    webOnly: "Загрузка FIT доступна в веб-версии. Откройте приложение в браузере.",
  },
} as const;

export type TranslationKey = keyof typeof ru;
