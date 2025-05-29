// Загружаем переменные окружения из файла .env
require('dotenv').config();

const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Получаем переменные из окружения
const token = process.env.TELEGRAM_BOT_TOKEN;
const remonlineToken = process.env.REMONLINE_API_TOKEN;
const EXTERNAL_CLIENT_ID = parseInt(process.env.EXTERNAL_CLIENT_ID);

console.log('🔍 Отладка переменных .env:');
console.log('KYIV_CITY_ID:', process.env.KYIV_CITY_ID);
console.log('LVIV_CITY_ID:', process.env.LVIV_CITY_ID);
console.log('ODESA_CITY_ID:', process.env.ODESA_CITY_ID);
console.log('VINNYTSIA_CITY_ID:', process.env.VINNYTSIA_CITY_ID);
console.log('POLTAVA_CITY_ID:', process.env.POLTAVA_CITY_ID);
console.log('IVANOFRANKIVSK_CITY_ID:', process.env.IVANOFRANKIVSK_CITY_ID);
console.log('CHERKASY_CITY_ID:', process.env.CHERKASY_CITY_ID);

// Проверяем, что все необходимые переменные установлены
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN не установлен в файле .env');
  process.exit(1);
}

if (!remonlineToken) {
  console.error('❌ REMONLINE_API_TOKEN не установлен в файле .env');
  process.exit(1);
}

// Создаем новый экземпляр бота
const bot = new TelegramBot(token, { polling: true });

// Путь к файлу с данными пользователей
const USER_DATA_FILE = path.join(__dirname, 'user_preferences.json');

// ID телеграм-каналов и групп из переменных окружения
const TELEGRAM_CHANNELS = {
  [process.env.KYIV_CITY_ID]: {
    name: 'Киев',
    channel: process.env.KYIV_CHANNEL_ID,
    client_id: parseInt(process.env.KYIV_CLIENT_ID)
  },
  [process.env.LVIV_CITY_ID]: {
    name: 'Львів-1',
    channel: process.env.LVIV_1_CHANNEL_ID,
    client_id: parseInt(process.env.LVIV_1_CLIENT_ID)
  },
  [process.env.LVIV_CITY_ID]: {
    name: 'Львів-2',
    channel: process.env.LVIV_2_CHANNEL_ID,
    client_id: parseInt(process.env.LVIV_2_CLIENT_ID)
  },
  [process.env.LVIV_CITY_ID]: {
    name: 'Львів-3',
    channel: process.env.LVIV_3_CHANNEL_ID,
    client_id: parseInt(process.env.LVIV_3_CLIENT_ID)
  },
  [process.env.ODESA_CITY_ID]: {
    name: 'Одеса',
    channel: process.env.ODESA_CHANNEL_ID,
    group: process.env.ODESA_GROUP_ID,
    group_topic_id: null,
    client_id: parseInt(process.env.ODESA_CLIENT_ID)
  },
  [process.env.VINNYTSIA_CITY_ID]: {
    name: 'Вінниця',
    channel: process.env.VINNYTSIA_CHANNEL_ID,
    client_id: parseInt(process.env.VINNYTSIA_CLIENT_ID)
  },
  [process.env.POLTAVA_CITY_ID]: {
    name: 'Полтава',
    channel: process.env.POLTAVA_CHANNEL_ID,
    client_id: parseInt(process.env.POLTAVA_CLIENT_ID)
  },
  [process.env.IVANOFRANKIVSK_CITY_ID]: {
    name: 'Івано-Франківськ',
    channel: process.env.IVANOFRANKIVSK_CHANNEL_ID,
    client_id: parseInt(process.env.IVANOFRANKIVSK_CLIENT_ID)
  },
  [process.env.CHERKASY_CITY_ID]: {
    name: 'Черкаси',
    channel: process.env.CHERKASY_CHANNEL_ID,
    client_id: parseInt(process.env.CHERKASY_CLIENT_ID)
  },
  [process.env.CHERNIVTSI_CITY_ID]: {
    name: 'Чернівці',
    channel: process.env.CHERNIVTSI_CHANNEL_ID,
    client_id: parseInt(process.env.CHERNIVTSI_CLIENT_ID)
  },
  [process.env.LUTSK_1_CITY_ID]: {
    name: 'Луцьк-1',
    channel: process.env.LUTSK_1_CHANNEL_ID,
    client_id: parseInt(process.env.LUTSK_1_CLIENT_ID)
  },
  [process.env.LUTSK_2_CITY_ID]: {
    name: 'Луцьк-2',
    channel: process.env.LUTSK_2_CHANNEL_ID,
    client_id: parseInt(process.env.LUTSK_2_CLIENT_ID)
  },
  [process.env.RIVNE_1_CITY_ID]: {
    name: 'Рівне-1',
    channel: process.env.RIVNE_1_CHANNEL_ID,
    client_id: parseInt(process.env.RIVNE_1_CLIENT_ID)
  },
  [process.env.RIVNE_2_CITY_ID]: {
    name: 'Рівне-2',
    channel: process.env.RIVNE_2_CHANNEL_ID,
    client_id: parseInt(process.env.RIVNE_2_CLIENT_ID)
  }
};

// Константы для типов заказов из переменных окружения
const ORDER_TYPE = parseInt(process.env.ORDER_TYPE);
const ORDER_STATUS = parseInt(process.env.ORDER_STATUS);

// Объект для хранения данных пользователя в рамках одной сессии
const userSessions = {};

// Функция для загрузки пользовательских предпочтений из файла
function loadUserPreferences() {
  try {
    if (fs.existsSync(USER_DATA_FILE)) {
      const data = fs.readFileSync(USER_DATA_FILE, 'utf8');
      return JSON.parse(data);
    }
    return {};
  } catch (error) {
    console.error('Ошибка при загрузке данных пользователей:', error);
    return {};
  }
}

// Функция для сохранения пользовательских предпочтений в файл
function saveUserPreferences(userPreferences) {
  try {
    fs.writeFileSync(USER_DATA_FILE, JSON.stringify(userPreferences, null, 2), 'utf8');
  } catch (error) {
    console.error('Ошибка при сохранении данных пользователей:', error);
  }
}

// Функция для сохранения предпочтения города пользователя
function saveUserCityPreference(userId, cityId) {
  const userPreferences = loadUserPreferences();
  userPreferences[userId] = {
    ...userPreferences[userId],
    preferredCityId: cityId,
    lastUpdated: new Date().toISOString()
  };
  saveUserPreferences(userPreferences);
  console.log(`Сохранено предпочтение города для пользователя ${userId}: ${cityId}`);
}

// Функция для получения предпочтения города пользователя
function getUserCityPreference(userId) {
  const userPreferences = loadUserPreferences();
  return userPreferences[userId]?.preferredCityId || null;
}

// Функция для повторных попыток API-запросов с обработкой ошибок сети
async function retryApiRequest(apiFunction, maxRetries = 3, delay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Попытка API-запроса ${attempt}/${maxRetries}...`);
      const result = await apiFunction();
      console.log('API-запрос выполнен успешно');
      return result;
    } catch (error) {
      lastError = error;
      
      // Логирование ошибки
      console.error(`Ошибка API-запроса (попытка ${attempt}/${maxRetries}):`, error.message);
      
      // Проверка на ошибки DNS/сети
      if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        console.log(`Проблема с подключением к API. Ожидание ${delay/1000} секунд перед повторной попыткой...`);
        
        // Ожидание перед следующей попыткой
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        // Для других ошибок просто возвращаем ошибку
        throw error;
      }
    }
  }
  
  // Если все попытки не удались, выбрасываем последнюю ошибку
  throw new Error(`Не удалось подключиться к API после ${maxRetries} попыток: ${lastError.message}`);
}

// Функция для создания новой темы в группе Telegram
async function createTopicInGroup(groupId, topicName) {
  try {
    console.log(`Создание темы "${topicName}" в группе ${groupId}...`);
    
    // Используем Telegram Bot API для создания новой темы
    const response = await bot.createForumTopic(groupId, topicName);
    
    if (response && response.message_thread_id) {
      console.log(`Тема успешно создана с ID: ${response.message_thread_id}`);
      return response.message_thread_id;
    } else {
      throw new Error('Не удалось получить ID созданной темы');
    }
  } catch (error) {
    console.error(`Ошибка при создании темы в группе: ${error.message}`);
    throw error;
  }
}

// Инициализация сессии пользователя
function initUserSession(chatId) {
  if (!userSessions[chatId]) {
    userSessions[chatId] = {
      step: 'start',
      cityId: null,
      carPhoto: null,
      carRegNumber: null,
      repairDescription: null,
      orderType: null
    };
    
    // Проверяем, есть ли у пользователя сохраненный город
    const preferredCityId = getUserCityPreference(chatId);
    if (preferredCityId) {
      userSessions[chatId].cityId = preferredCityId;
      console.log(`Для пользователя ${chatId} установлен сохраненный город: ${preferredCityId}`);
    }
  }
  return userSessions[chatId];
}

// Функция для отображения клавиатуры с меню
function showMainMenu(chatId, message = 'Виберіть дію:') {
  const keyboard = {
    keyboard: [
      [{ text: '/start' }, { text: '/edit' }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
  
  return bot.sendMessage(chatId, message, {
    reply_markup: keyboard
  });
}

// Обработчик команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const session = initUserSession(chatId);
  
  // Если у пользователя уже есть выбранный город, предлагаем выбрать тип заказа
  if (session.cityId) {
    const cityName = TELEGRAM_CHANNELS[session.cityId].name;
    
    // Показываем выбор типа заказа с указанием текущего города
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔴 НОВЕ ЗАМОВЛЕННЯ', callback_data: 'order_new' }],
        [{ text: '🟢 ІСНУЮЧЕ ЗАМОВЛЕННЯ', callback_data: 'order_existing' }],
        [{ text: '🔄 Змінити місто', callback_data: 'change_city' }]
      ]
    };
    
    bot.sendMessage(chatId, `Ласкаво просимо! Ваше поточне місто: ${cityName}\nВиберіть тип замовлення:`, {
      reply_markup: keyboard
    });
  } else {
    // Если город не выбран, показываем стандартное приветствие
    showMainMenu(chatId, 'Ласкаво просимо! Натисніть /edit, щоб вибрати місто.');
  }
});

// Обработчик команды /edit
bot.onText(/\/edit/, (msg) => {
  const chatId = msg.chat.id;
  const session = initUserSession(chatId);
  showCitySelectionMenu(chatId);
});

// Функция для отображения меню выбора города
function showCitySelectionMenu(chatId) {
  const session = userSessions[chatId];
  session.step = 'choose_city';
  
  const keyboard = {
    inline_keyboard: [
      [{ text: '1. Київ', callback_data: `city_${process.env.KYIV_CITY_ID}` }],
      [{ text: '2. Львів-1', callback_data: `city_${process.env.LVIV_1_CITY_ID}` }],
      [{ text: '3. Львів-2', callback_data: `city_${process.env.LVIV_2_CITY_ID}` }],
      [{ text: '4. Львів-3', callback_data: `city_${process.env.LVIV_3_CITY_ID}` }],
      [{ text: '5. Одеса', callback_data: `city_${process.env.ODESA_CITY_ID}` }],
      [{ text: '6. Вінниця', callback_data: `city_${process.env.VINNYTSIA_CITY_ID}` }],
      [{ text: '7. Полтава', callback_data: `city_${process.env.POLTAVA_CITY_ID}` }],
      [{ text: '8. Івано-Франківськ', callback_data: `city_${process.env.IVANOFRANKIVSK_CITY_ID}` }],
      [{ text: '9. Черкаси', callback_data: `city_${process.env.CHERKASY_CITY_ID}` }],
      [{ text: '10. Чернівці', callback_data: `city_${process.env.CHERNIVTSI_CITY_ID}` }],
      [{ text: '11. Луцьк-1', callback_data: `city_${process.env.LUTSK_1_CITY_ID}` }],
      [{ text: '12. Луцьк-2', callback_data: `city_${process.env.LUTSK_2_CITY_ID}` }],
      [{ text: '13. Рівне-1', callback_data: `city_${process.env.RIVNE_1_CITY_ID}` }],
      [{ text: '14. Рівне-2', callback_data: `city_${process.env.RIVNE_2_CITY_ID}` }],
    ]
  };
  
  bot.sendMessage(chatId, 'Виберіть місто:', {
    reply_markup: keyboard
  });
}

// Обработчик callback запросов (для кнопок) - С ОТЛАДКОЙ
// Функция для безопасного ответа на callback
async function safeAnswerCallbackQuery(callbackQuery, text) {
  try {
    await bot.answerCallbackQuery(callbackQuery.id, text);
  } catch (error) {
    if (error.message.includes('query is too old')) {
      console.log('⚠️ Callback query устарел, игнорируем');
    } else {
      console.error('❌ Ошибка при ответе на callback:', error.message);
    }
  }
}

// Обработчик callback запросов (ИСПРАВЛЕННАЯ ВЕРСИЯ)
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  console.log(`📝 Получен callback: ${data} от пользователя ${chatId}`);
  console.log(`🔍 Текущие сессии:`, Object.keys(userSessions));
  
  let session = userSessions[chatId];
  
  // Если сессии нет, создаем новую
  if (!session) {
    console.log(`⚠️ Сессия не найдена для пользователя ${chatId}, создаем новую`);
    session = initUserSession(chatId);
  }
  
  console.log(`📊 Текущий шаг сессии: ${session.step}`);
  console.log(`🏙️ Текущий город: ${session.cityId}`);
  
  // Обработка выбора города
  if (data.startsWith('city_')) {
    const cityId = data.replace('city_', '');
    console.log(`🏙️ Выбран город с ID: ${cityId}`);
    
    // Проверяем, что город существует в конфигурации
    if (!TELEGRAM_CHANNELS[cityId]) {
      console.error(`❌ Город с ID ${cityId} не найден в конфигурации`);
      await safeAnswerCallbackQuery(callbackQuery, 'Помилка: місто не знайдено');
      bot.sendMessage(chatId, 'Помилка: вибране місто не знайдено в конфігурації бота.');
      return;
    }
    
    session.cityId = cityId;
    session.step = 'choose_order_type';
    
    // Сохраняем предпочтение города для пользователя
    saveUserCityPreference(chatId, cityId);
    
    console.log(`✅ Город установлен: ${TELEGRAM_CHANNELS[cityId].name}`);
    
    await safeAnswerCallbackQuery(callbackQuery, `Вибрано місто: ${TELEGRAM_CHANNELS[cityId].name}`);
    
    // Отображаем кнопки выбора типа заказа
    const keyboard = {
      inline_keyboard: [
        [{ text: '🔴 НОВЕ ЗАМОВЛЕННЯ', callback_data: 'order_new' }],
        [{ text: '🟢 ІСНУЮЧЕ ЗАМОВЛЕННЯ', callback_data: 'order_existing' }]
      ]
    };
    
    bot.sendMessage(chatId, 'Виберіть тип замовлення:', {
      reply_markup: keyboard
    });
  }
  // Обработка запроса на изменение города
  else if (data === 'change_city') {
    console.log(`🔄 Пользователь ${chatId} хочет изменить город`);
    await safeAnswerCallbackQuery(callbackQuery, 'Змінити місто');
    showCitySelectionMenu(chatId);
  }
  // Обработка выбора типа заказа
  else if (data === 'order_new' || data === 'order_existing') {
    console.log(`📝 Выбран тип заказа: ${data}`);
    
    session.orderType = data;
    session.step = 'upload_photo';
    
    if (data === 'order_new') {
      await safeAnswerCallbackQuery(callbackQuery, 'Вибрано: НОВЕ ЗАМОВЛЕННЯ');
      bot.sendMessage(chatId, 'Завантажте фотографію автомобіля.');
    } else {
      await safeAnswerCallbackQuery(callbackQuery, 'Вибрано: ІСНУЮЧЕ ЗАМОВЛЕННЯ');
      bot.sendMessage(chatId, 'Завантажте фотографію автомобіля.');
    }
    
    console.log(`✅ Установлен тип заказа: ${data}, следующий шаг: upload_photo`);
  }
  // Обработка выбора типа клиента
  // Обработка выбора типа клиента
else if (data === 'client_external' || data === 'client_autopark') {
  console.log(`👤 Выбран тип клиента: ${data}`);
  
  session.clientType = data;
  
  if (data === 'client_autopark') {
    await safeAnswerCallbackQuery(callbackQuery, 'Створюємо замовлення для автопарку...');
    // Создаем заказ через API Remonline для автопарка
    await createOrder(chatId, 'autopark');
  } else if (data === 'client_external') {
    await safeAnswerCallbackQuery(callbackQuery, 'Створюємо замовлення для зовнішнього клієнта...');
    // Создаем заказ через API Remonline для внешнего клиента
    await createOrder(chatId, 'external');
  }
}
  else {
    console.log(`❓ Неизвестный callback: ${data}`);
    await safeAnswerCallbackQuery(callbackQuery, 'Невідома команда');
  }
});

// Добавьте обработчик необработанных ошибок
process.on('unhandledRejection', (reason, promise) => {
  console.log('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // НЕ выходим из процесса, просто логируем
});

// Улучшенная проверка конфигурации при запуске
console.log('🤖 Конфигурация бота:');
console.log(`   Города: ${Object.keys(TELEGRAM_CHANNELS).join(', ')}`);

// Проверка каждого города отдельно
Object.entries(TELEGRAM_CHANNELS).forEach(([cityId, config]) => {
  const hasChannel = !!config.channel;
  const hasClientId = !!config.client_id && !isNaN(config.client_id);
  const status = (hasChannel && hasClientId) ? '✅' : '❌';
  
  console.log(`   ${config.name} (${cityId}): ${status}`);
  if (!hasChannel) console.log(`     ❌ Отсутствует channel ID`);
  if (!hasClientId) console.log(`     ❌ Отсутствует или неверный client_id`);
});

console.log(`   API токены настроены: ${token && remonlineToken ? '✅' : '❌'}`);

// Улучшенная функция инициализации сессии
function initUserSession(chatId) {
  console.log(`🔧 Инициализация сессии для пользователя ${chatId}`);
  
  if (!userSessions[chatId]) {
    userSessions[chatId] = {
      step: 'start',
      cityId: null,
      carPhoto: null,
      carRegNumber: null,
      repairDescription: null,
      orderType: null,
      createdAt: new Date().toISOString()
    };
    
    // Проверяем, есть ли у пользователя сохраненный город
    const preferredCityId = getUserCityPreference(chatId);
    if (preferredCityId) {
      userSessions[chatId].cityId = preferredCityId;
      console.log(`🏙️ Для пользователя ${chatId} установлен сохраненный город: ${preferredCityId}`);
    }
    
    console.log(`✅ Сессия создана для пользователя ${chatId}:`, userSessions[chatId]);
  } else {
    console.log(`ℹ️ Сессия уже существует для пользователя ${chatId}`);
  }
  
  return userSessions[chatId];
}

// Функция для отладки сессий
function debugSessions(chatId = null) {
  if (chatId) {
    console.log(`🔍 Сессия пользователя ${chatId}:`, userSessions[chatId]);
  } else {
    console.log(`🔍 Все активные сессии:`, userSessions);
  }
}
/*------------------------------------*/

// Обработчик загрузки фото
/* bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  const session = userSessions[chatId];
  
  if (!session) {
    bot.sendMessage(chatId, 'Сесія закінчилася. Почніть заново з команди /start');
    return;
  }
  
  if (session.step === 'upload_photo') {
    // Берем самое большое фото из массива (последнее имеет наилучшее качество)
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    session.carPhoto = photoId;
    session.step = 'enter_reg_number';
    
    bot.sendMessage(chatId, 'Тепер введіть реєстраційний номер автомобіля.');
  }
}); */
/*----------------------------------*/
// Обработчик загрузки фото - С ОТЛАДКОЙ
bot.on('photo', (msg) => {
  const chatId = msg.chat.id;
  console.log(`📸 Получено фото от пользователя ${chatId}`);
  
  let session = userSessions[chatId];
  
  if (!session) {
    console.log(`⚠️ Сессия не найдена при загрузке фото, создаем новую`);
    session = initUserSession(chatId);
  }
  
  console.log(`📊 Текущий шаг при загрузке фото: ${session.step}`);
  
  if (session.step === 'upload_photo') {
    // Берем самое большое фото из массива (последнее имеет наилучшее качество)
    const photoId = msg.photo[msg.photo.length - 1].file_id;
    session.carPhoto = photoId;
    session.step = 'enter_reg_number';
    
    console.log(`✅ Фото сохранено, следующий шаг: enter_reg_number`);
    
    bot.sendMessage(chatId, 'Тепер введіть реєстраційний номер автомобіля.');
  } else {
    console.log(`❌ Неожиданный шаг при загрузке фото: ${session.step}`);
    bot.sendMessage(chatId, 'Помилка: неочікуваний крок. Почніть заново з команди /start');
  }
});
/*----------------------------------*/
// Обработчик текстовых сообщений
/* bot.on('text', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const session = userSessions[chatId];
  
  // Игнорируем команды
  if (text.startsWith('/')) return;
  
  if (!session) {
    bot.sendMessage(chatId, 'Сесія закінчилася. Почніть заново з команди /start');
    return;
  }
  
  // Обработка ввода регистрационного номера
  if (session.step === 'enter_reg_number') {
    session.carRegNumber = text;
    
    // Разная логика в зависимости от типа заказа
    if (session.orderType === 'order_new') {
      session.step = 'enter_description';
      bot.sendMessage(chatId, 'Тепер введіть короткий опис причин ремонту.');
    } else if (session.orderType === 'order_existing') {
      // Для существующего заказа сразу отправляем информацию в каналы
      processExistingOrder(chatId);
    }
  } 
  // Обработка ввода описания для нового заказа
  else if (session.step === 'enter_description') {
    session.repairDescription = text;
    session.step = 'choose_client_type';
    
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Зовнішній клієнт', callback_data: 'client_external' }],
        [{ text: 'Автопарк', callback_data: 'client_autopark' }]
      ]
    };
    
    bot.sendMessage(chatId, 'Виберіть тип клієнта:', {
      reply_markup: keyboard
    });
  }
}); */
/*-----------------------------------*/
// Обработчик текстовых сообщений - С ОТЛАДКОЙ
bot.on('text', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  // Игнорируем команды
  if (text.startsWith('/')) return;
  
  console.log(`💬 Получено текстовое сообщение от ${chatId}: "${text}"`);
  
  let session = userSessions[chatId];
  
  if (!session) {
    console.log(`⚠️ Сессия не найдена при обработке текста, создаем новую`);
    session = initUserSession(chatId);
  }
  
  console.log(`📊 Текущий шаг при обработке текста: ${session.step}`);
  
  // Обработка ввода регистрационного номера
  if (session.step === 'enter_reg_number') {
    session.carRegNumber = text;
    console.log(`🚗 Сохранен регистрационный номер: ${text}`);
    
    // Разная логика в зависимости от типа заказа
    if (session.orderType === 'order_new') {
      session.step = 'enter_description';
      bot.sendMessage(chatId, 'Тепер введіть короткий опис причин ремонту.');
      console.log(`➡️ Переход к вводу описания для нового заказа`);
    } else if (session.orderType === 'order_existing') {
      console.log(`➡️ Обработка существующего заказа`);
      // Для существующего заказа сразу отправляем информацию в каналы
      processExistingOrder(chatId);
    }
  } 
  // Обработка ввода описания для нового заказа
  else if (session.step === 'enter_description') {
    session.repairDescription = text;
    session.step = 'choose_client_type';
    
    console.log(`📝 Сохранено описание: ${text}`);
    
    const keyboard = {
      inline_keyboard: [
        [{ text: 'Зовнішній клієнт', callback_data: 'client_external' }],
        [{ text: 'Автопарк', callback_data: 'client_autopark' }]
      ]
    };
    
    bot.sendMessage(chatId, 'Виберіть тип клієнта:', {
      reply_markup: keyboard
    });
    
    console.log(`➡️ Переход к выбору типа клиента`);
  }
  else {
    console.log(`❓ Неожиданный шаг при обработке текста: ${session.step}`);
  }
});
/*-------------------------------------*/
// Обработчик ошибок и неизвестных команд
bot.onText(/\/.*/, (msg) => {
  const text = msg.text;
  const chatId = msg.chat.id;
  
  // Если команда не /start и не /edit, показываем сообщение о неизвестной команде
  if (text !== '/start' && text !== '/edit') {
    showMainMenu(chatId, `Невідома команда. Будь ласка, скористайтеся меню:`);
  }
});

// Функция для обработки существующего заказа
async function processExistingOrder(chatId) {
  const session = userSessions[chatId];
  
  try {
    bot.sendMessage(chatId, 'Обробляю існуюче замовлення...');
    
    // Скачиваем фото для отправки в канал
    const fileUrl = await bot.getFileLink(session.carPhoto);
    const photoResponse = await retryApiRequest(async () => {
      return await axios({
        method: 'GET',
        url: fileUrl,
        responseType: 'arraybuffer',
        timeout: 10000 // 10 секунд тайм-аут
      });
    });
    
    // Формируем сообщение для отправки в Telegram-канал
    const messageText = `
[ІСНУЮЧЕ ЗАМОВЛЕННЯ]
${session.carRegNumber}
    `;
    
    // Отправляем фото с описанием
    try {
      // Отправка пользователю
      await bot.sendPhoto(chatId, Buffer.from(photoResponse.data), {
        caption: messageText
      });
      console.log('Сообщение с информацией о заказе отправлено пользователю');
      
      // Отправка в канал
      const cityId = session.cityId;
      const channelId = TELEGRAM_CHANNELS[cityId].channel;
      console.log(`Попытка отправки в канал: ${channelId}`);
      await bot.sendPhoto(channelId, Buffer.from(photoResponse.data), {
        caption: messageText
      });
      console.log('Сообщение успешно отправлено в основной канал');
      
      // Если это Одесса, также отправляем в группу
      if (cityId === process.env.ODESA_CITY_ID && TELEGRAM_CHANNELS[cityId].group) {
        const groupId = TELEGRAM_CHANNELS[cityId].group;
        console.log(`Попытка отправки в группу: ${groupId}`);
        
        // Создаем новую тему по регистрационному номеру автомобиля
        let topicId = null;
        try {
          // Название темы: регистрационный номер + [Існуюче]
          const topicName = `${session.carRegNumber} [Існуюче]`;
          topicId = await createTopicInGroup(groupId, topicName);
          
          // Сохраняем ID темы в TELEGRAM_CHANNELS для возможного дальнейшего использования
          TELEGRAM_CHANNELS[cityId].group_topic_id = topicId;
        } catch (topicError) {
          console.error(`Ошибка при создании темы: ${topicError.message}`);
          // Если не удалось создать тему, продолжаем без неё
        }
        
        // Опции для отправки сообщения
        const options = {
          caption: messageText
        };
        
        // Если успешно создана тема, отправляем в неё
        if (topicId) {
          options.message_thread_id = topicId;
        }
        
        await bot.sendPhoto(groupId, Buffer.from(photoResponse.data), options);
        console.log('Сообщение успешно отправлено в группу' + (topicId ? ' в тему №' + topicId : ''));
      }
      
      // Уведомляем пользователя об успешной обработке
      showMainMenu(chatId, `✅ Існуюче замовлення успішно оброблено!\n\nВиберіть дію для створення нового замовлення:`);
      
      // Очищаем сессию пользователя
      delete userSessions[chatId];
      // Создаем новую сессию с сохраненным городом
      initUserSession(chatId);
      
    } catch (error) {
      console.error(`Ошибка при отправке сообщения: ${error.message}`);
      bot.sendMessage(chatId, `⚠️ Виникла помилка при відправці повідомлення: ${error.message}`);
    }
  } catch (error) {
    console.error('Ошибка при обработке существующего заказа:', error);
    showMainMenu(chatId, `❌ Виникла помилка при обробці існуючого замовлення: ${error.message}\n\nВиберіть дію:`);
  }
}

// Функция для создания заказа в Remonline
async function createOrder(chatId, clientType = 'autopark') {
  const session = userSessions[chatId];
  
  try {
    const clientTypeText = clientType === 'external' ? 'зовнішнього клієнта' : 'автопарку';
    bot.sendMessage(chatId, `Створюю замовлення в системі для ${clientTypeText}...`);
    
    // Формируем данные для первого API-запроса
    const cityId = session.cityId;
    
    // Выбираем client_id в зависимости от типа клиента
    let clientId;
    if (clientType === 'external') {
      clientId = EXTERNAL_CLIENT_ID; // Для внешних клиентов всегда используем один ID
      console.log(`🏢 Используется ID внешнего клиента: ${clientId}`);
    } else {
      clientId = TELEGRAM_CHANNELS[cityId].client_id; // Для автопарка используем ID по городу
      console.log(`🚗 Используется ID автопарка для города ${TELEGRAM_CHANNELS[cityId].name}: ${clientId}`);
    }
    
    // Первый API-запрос для создания заказа с повторными попытками
    const createOrderResponse = await retryApiRequest(async () => {
      return await axios({
        method: 'POST',
        url: `https://api.remonline.app/order/?token=${remonlineToken}`,
        headers: {
          'accept': 'application/json', 
          'content-type': 'application/json'
        },
        data: {
          branch_id: parseInt(cityId),
          order_type: ORDER_TYPE,
          client_id: clientId
        },
        timeout: 10000 // 10 секунд тайм-аут
      });
    });
    
    if (createOrderResponse.data && createOrderResponse.data.success) {
      const orderId = createOrderResponse.data.data.id;
      console.log(`✅ Заказ создан в Remonline с ID: ${orderId}`);
      
      // Второй API-запрос для получения информации о созданном заказе с повторными попытками
      const getOrdersResponse = await retryApiRequest(async () => {
        return await axios({
          method: 'GET',
          url: `https://api.remonline.app/order/?page=1&branches[]=${cityId}&statuses[]=${ORDER_STATUS}&token=${remonlineToken}`,
          headers: {
            'accept': 'application/json'
          },
          timeout: 10000 // 10 секунд тайм-аут
        });
      });
      
      if (getOrdersResponse.data && getOrdersResponse.data.data && getOrdersResponse.data.data.length > 0) {
        // Находим наш заказ в списке
        const createdOrder = getOrdersResponse.data.data.find(order => order.id === orderId);
        
        if (createdOrder) {
          const orderLabel = createdOrder.id_label;
          console.log(`📋 Получен номер заказа: ${orderLabel}`);
          
          // Скачиваем фото для последующей отправки в канал
          const fileUrl = await bot.getFileLink(session.carPhoto);
          const photoResponse = await retryApiRequest(async () => {
            return await axios({
              method: 'GET',
              url: fileUrl,
              responseType: 'arraybuffer',
              timeout: 10000 // 10 секунд тайм-аут
            });
          });
          
          // Формируем сообщение для отправки в Telegram-канал
          // Добавляем информацию о типе клиента в сообщение
          const clientTypeLabel = clientType === 'external' ? 'ЗОВНІШНІЙ КЛІЄНТ' : 'АВТОПАРК';
          const messageText = `
[НОВЕ ЗАМОВЛЕННЯ - ${clientTypeLabel}]
${session.carRegNumber}
${orderLabel}
${session.repairDescription}
          `;
          
          console.log(`📝 Сформировано сообщение для канала:`, messageText.trim());
          
          // Отправляем фото с описанием в соответствующий канал
          try {
            // Отправка пользователю для подтверждения
            await bot.sendPhoto(chatId, Buffer.from(photoResponse.data), {
              caption: messageText
            });
            console.log('📱 Сообщение с информацией о заказе отправлено пользователю');
            
            // Отправка в основной канал
            const channelId = TELEGRAM_CHANNELS[cityId].channel;
            console.log(`📡 Попытка отправки в канал: ${channelId}`);
            await bot.sendPhoto(channelId, Buffer.from(photoResponse.data), {
              caption: messageText
            });
            console.log('✅ Сообщение успешно отправлено в основной канал');
            
            // Если это Одесса, также отправляем в группу
            if (cityId === process.env.ODESA_CITY_ID && TELEGRAM_CHANNELS[cityId].group) {
              const groupId = TELEGRAM_CHANNELS[cityId].group;
              console.log(`📡 Попытка отправки в группу: ${groupId}`);
              
              // Создаем новую тему по регистрационному номеру автомобиля
              let topicId = null;
              try {
                // Название темы: регистрационный номер + номер заказа + тип клиента
                const topicName = `${session.carRegNumber} - ${orderLabel} [${clientTypeLabel}]`;
                topicId = await createTopicInGroup(groupId, topicName);
                
                // Сохраняем ID темы в TELEGRAM_CHANNELS для возможного дальнейшего использования
                TELEGRAM_CHANNELS[cityId].group_topic_id = topicId;
              } catch (topicError) {
                console.error(`❌ Ошибка при создании темы: ${topicError.message}`);
                // Если не удалось создать тему, продолжаем без неё
              }
              
              // Опции для отправки сообщения
              const options = {
                caption: messageText
              };
              
              // Если успешно создана тема, отправляем в неё
              if (topicId) {
                options.message_thread_id = topicId;
              }
              
              await bot.sendPhoto(groupId, Buffer.from(photoResponse.data), options);
              console.log('✅ Сообщение успешно отправлено в группу' + (topicId ? ' в тему №' + topicId : ''));
            }
        
          } catch (error) {
            console.error(`❌ Ошибка при отправке сообщения: ${error.message}`);
            bot.sendMessage(chatId, `⚠️ Замовлення було створено успішно, але не вдалося надіслати інформацію: ${error.message}`);
          }
          
          // Уведомляем пользователя об успешном создании заказа
          const successMessage = `✅ Замовлення успішно створено!\n📋 Номер замовлення: ${orderLabel}\n👤 Тип клієнта: ${clientTypeLabel}\n\nВиберіть дію для створення нового замовлення:`;
          showMainMenu(chatId, successMessage);
          
          // Очищаем сессию пользователя
          delete userSessions[chatId];
          // Создаем новую сессию с сохраненным городом
          initUserSession(chatId);
          
        } else {
          throw new Error('Не вдалося знайти створене замовлення у списку.');
        }
      } else {
        throw new Error('Не вдалося отримати інформацію про створені замовлення.');
      }
    } else {
      throw new Error('Не вдалося створити замовлення у системі.');
    }
  } catch (error) {
    console.error('❌ Ошибка при создании заказа:', error);
    const clientTypeText = clientType === 'external' ? 'зовнішнього клієнта' : 'автопарку';
    showMainMenu(chatId, `❌ Виникла помилка при створенні замовлення для ${clientTypeText}: ${error.message}\n\nВиберіть дію:`);
  }
}

// Создаем файл для хранения данных пользователей, если он не существует
if (!fs.existsSync(USER_DATA_FILE)) {
  fs.writeFileSync(USER_DATA_FILE, '{}', 'utf8');
  console.log(`Создан файл для хранения данных пользователей: ${USER_DATA_FILE}`);
}

// Проверяем конфигурацию при запуске
console.log('🤖 Конфигурация бота:');
console.log(`   Города: ${Object.keys(TELEGRAM_CHANNELS).join(', ')}`);
console.log(`   Каналы настроены: ${Object.values(TELEGRAM_CHANNELS).every(ch => ch.channel) ? '✅' : '❌'}`);
console.log(`   API токены настроены: ${token && remonlineToken ? '✅' : '❌'}`);

// Запускаем бота
console.log('🚀 Бот запущен и готов к работе...');

/*----------------------------------*/
// Добавьте обработчик ошибок polling
bot.on('polling_error', (error) => {
  console.log('❌ Ошибка polling:', error.message);
});

// Добавьте проверку токена при запуске
async function validateBotToken() {
  try {
    const botInfo = await bot.getMe();
    console.log(`✅ Бот подключен: @${botInfo.username} (${botInfo.first_name})`);
    return true;
  } catch (error) {
    console.log('❌ Ошибка подключения к боту:', error.message);
    console.log('🔍 Проверьте токен бота в файле .env');
    return false;
  }
}

// Вызовите проверку при запуске
validateBotToken();