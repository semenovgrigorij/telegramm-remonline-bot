const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Замените на свой токен бота
const token = '8026606898:AAEcpb8avNsTWe8ehwDVsAF-sKy3WiYKfwg';

// Токен API Remonline
const remonlineToken = 'b2a2a651c2e2caa7a709371e449e1f357037390f';

// Создаем новый экземпляр бота
const bot = new TelegramBot(token, { polling: true });

// Путь к файлу с данными пользователей
const USER_DATA_FILE = path.join(__dirname, 'user_preferences.json');

// ID телеграм-каналов и групп
const TELEGRAM_CHANNELS = {
  '134397': {
    name: 'Киев',
    channel: '-1001875084216', // Замените на реальный ID канала или имя 
    client_id: 24344771
  },
  '171966': {
    name: 'Одесса',
    channel: '-1002367686579', // Замените на реальный ID канала или имя
    group: '-1002597740900', // Замените на реальный ID группы или имя
    group_topic_id: null, // Будет устанавливаться динамически при создании темы
    client_id: 24344777
  }
};

// Константы для типов заказов
const ORDER_TYPE = 240552;
const ORDER_STATUS = 1642511;

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
      orderType: null // Новый или существующий заказ
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
      [{ text: '1. Київ', callback_data: 'city_134397' }],
      [{ text: '2. Одеса', callback_data: 'city_171966' }]
    ]
  };
  
  bot.sendMessage(chatId, 'Виберіть місто:', {
    reply_markup: keyboard
  });
}

// Обработчик callback запросов (для кнопок)
bot.on('callback_query', async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const session = userSessions[chatId];
  
  if (!session) {
    bot.sendMessage(chatId, 'Сесія закінчилася. Почніть заново з команди /start');
    return;
  }
  
  // Обработка выбора города
  if (data.startsWith('city_')) {
    const cityId = data.replace('city_', '');
    session.cityId = cityId;
    session.step = 'choose_order_type';
    
    // Сохраняем предпочтение города для пользователя
    saveUserCityPreference(chatId, cityId);
    
    bot.answerCallbackQuery(callbackQuery.id, `Вибрано місто: ${TELEGRAM_CHANNELS[cityId].name}`);
    
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
    bot.answerCallbackQuery(callbackQuery.id, 'Змінити місто');
    showCitySelectionMenu(chatId);
  }
  // Обработка выбора типа заказа
  else if (data === 'order_new' || data === 'order_existing') {
    session.orderType = data;
    session.step = 'upload_photo';
    
    if (data === 'order_new') {
      bot.answerCallbackQuery(callbackQuery.id, 'Вибрано: НОВЕ ЗАМОВЛЕННЯ');
      bot.sendMessage(chatId, 'Завантажте фотографію автомобіля.');
    } else {
      bot.answerCallbackQuery(callbackQuery.id, 'Вибрано: ІСНУЮЧЕ ЗАМОВЛЕННЯ');
      bot.sendMessage(chatId, 'Завантажте фотографію автомобіля.');
    }
  }
  // Обработка выбора типа клиента
  else if (data === 'client_external' || data === 'client_autopark') {
    session.clientType = data;
    
    if (data === 'client_autopark') {
      // Создаем заказ через API Remonline
      await createOrder(chatId);
    } else {
      // Для внешнего клиента (тут можно добавить дополнительную логику)
      bot.sendMessage(chatId, 'Для зовнішнього клієнта потрібна додаткова інформація.');
    }
  }
});

// Обработчик загрузки фото
bot.on('photo', (msg) => {
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
});

// Обработчик текстовых сообщений
bot.on('text', (msg) => {
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
});

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
      if (cityId === '171966' && TELEGRAM_CHANNELS[cityId].group) {
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
      
      // Очищаем сессию пользователя (но сохраняем cityId)
      
      delete userSessions[chatId];
      initUserSession(chatId); // Создаем новую сессию с сохраненным городом
      
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
async function createOrder(chatId) {
  const session = userSessions[chatId];
  
  try {
    bot.sendMessage(chatId, 'Створюю замовлення в системі...');
    
    // Формируем данные для первого API-запроса
    
    const clientId = TELEGRAM_CHANNELS[cityId].client_id;
    
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
          const messageText = `
[НОВЕ ЗАМОВЛЕННЯ]
${session.carRegNumber}
${orderLabel}
${session.repairDescription}
          `;
          
          // Отправляем фото с описанием в соответствующий канал
          try {
            // Для тестирования - отправка фото и информации обратно пользователю
            await bot.sendPhoto(chatId, Buffer.from(photoResponse.data), {
              caption: messageText
            });
            console.log('Сообщение с информацией о заказе отправлено пользователю');
            
            // Отправка в основной канал
            const channelId = TELEGRAM_CHANNELS[cityId].channel;
            console.log(`Попытка отправки в канал: ${channelId}`);
            await bot.sendPhoto(channelId, Buffer.from(photoResponse.data), {
              caption: messageText
            });
            console.log('Сообщение успешно отправлено в основной канал');
            
            // Если это Одесса, также отправляем в группу
            if (cityId === '171966' && TELEGRAM_CHANNELS[cityId].group) {
              const groupId = TELEGRAM_CHANNELS[cityId].group;
              console.log(`Попытка отправки в группу: ${groupId}`);
              
              // Создаем новую тему по регистрационному номеру автомобиля
              let topicId = null;
              try {
                // Название темы: регистрационный номер + номер заказа
                const topicName = `${session.carRegNumber} - ${orderLabel} [Нове]`;
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
        
          } catch (error) {
            console.error(`Ошибка при отправке сообщения: ${error.message}`);
            bot.sendMessage(chatId, `⚠️ Замовлення було створено успішно, але не вдалося надіслати інформацію: ${error.message}`);
          }
          
          // Уведомляем пользователя об успешном создании заказа
          showMainMenu(chatId, `✅ Замовлення успішно створено! Номер замовлення: ${orderLabel}\n\nВиберіть дію для створення нового замовлення:`);
          
          // Очищаем сессию пользователя (но сохраняем cityId)
          const cityId = session.cityId; // Сохраняем cityId перед удалением сессии
          delete userSessions[chatId];
          initUserSession(chatId); // Создаем новую сессию с сохраненным городом
          
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
    console.error('Ошибка при создании заказа:', error);
    showMainMenu(chatId, `❌ Виникла помилка при створенні замовлення: ${error.message}\n\nВиберіть дію:`);
  }
}

// Создаем файл для хранения данных пользователей, если он не существует
if (!fs.existsSync(USER_DATA_FILE)) {
  fs.writeFileSync(USER_DATA_FILE, '{}', 'utf8');
  console.log(`Создан файл для хранения данных пользователей: ${USER_DATA_FILE}`);
}

// Запускаем бота
console.log('Бот запущен...');