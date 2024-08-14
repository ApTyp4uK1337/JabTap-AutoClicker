const axios = require('axios');
const { formatDistanceToNow, parseISO } = require('date-fns');
const fs = require('fs').promises;

let packageJSON;
let config;

let postUrl;
let getUrl;
let headers;
let postBody;

// Глобальные переменные для хранения данных
let initialBalance = 0;
let earnedThisSession = 0;
let clickCounter = 0;
let energyOk = true; // Флаг для контроля состояния энергии

// Функция для чтения и парсинга JSON-файлов
async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Ошибка при чтении ${filePath}:`, error.message);
        process.exit(1);
    }
}

// Функция задержки
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция проверки авторизации
async function checkAuthorization() {
    try {
        const response = await axios.get(`${getUrl}?_=${Date.now()}`, { headers }); // Кэш-бустер
        const data = response.data;

        if (data && data.data && data.data.frog) {
            console.log(`» Успешная авторизация!`);
            console.log(`====================================`);
            console.log(`[        JabTap AutoClicker        ]`);
            console.log(`====================================`);
            console.log(`|   ID аккаунта: 777`);
            console.log(`|   Никнейм: root`);
            console.log(`====================================`);
            console.log(`» Запускаем кликер...`);

            // Изначально проверяем энергию
            return await printStats();
        } else {
            console.error('[!] Авторизация не удалась.');
            return false;
        }
    } catch (error) {
        console.error('[!] Ошибка при проверке авторизации:', error.response ? error.response.data : error.message);
        return false;
    }
}

// Функция проверки уровня энергии и вывода статистики
async function printStats() {
    try {
        const response = await axios.get(`${getUrl}?_=${Date.now()}`, { headers }); // Кэш-бустер
        const data = response.data;

        if (!data || !data.data || !data.data.frog) {
            console.error('[!] Не удалось получить данные из GET-запроса.');
            return false;
        }

        const frogData = data.data.frog;
        const experienceToNextLevel = parseFloat(frogData.experience) + parseFloat(frogData.level.requirement);
        const nextRechargeAt = parseISO(frogData.nextRechargeAt);
        const timeUntilRecharge = formatDistanceToNow(nextRechargeAt, { includeSeconds: true });

        if (initialBalance === 0) {
            initialBalance = parseFloat(frogData.balance); // Сохраняем начальный баланс
        }

        const currentBalance = parseFloat(frogData.balance);
        earnedThisSession = currentBalance - initialBalance;

        console.log('');
        console.log(`====================================`);
        console.log(`[        JabTap AutoClicker        ]`);
        console.log(`====================================`);
        console.log(`|   Уровень: [${frogData.level.name}] | EXP: ${Math.floor(frogData.experience)}/${Math.ceil(experienceToNextLevel)}`);
        console.log(`|   Энергия: ${frogData.remainingEnergy}/${frogData.energyLevel.energy}`);
        console.log(`|   Текущий баланс: ${Math.floor(frogData.balance)} MUH`);
        console.log(`|   Заработано за сессию: ${Math.floor(earnedThisSession.toFixed(2))} MUH`);
        console.log(`====================================`);
        console.log('» Обновление энергии через:', timeUntilRecharge);
        console.log('');

        // Обновляем флаг состояния энергии
        energyOk = frogData.remainingEnergy > 0;

        return energyOk;
    } catch (error) {
        console.error('[!] Ошибка при получении статистики:', error.response ? error.response.data : error.message);
        return false;
    }
}

// Функция отправки POST-запроса
async function sendRequest() {
    try {
        const response = await axios.post(postUrl, postBody, { headers });
        const { data } = response;

        if (data.success === true) {
            clickCounter++;
            console.log(`» Click: +${config.tapsCount} MUH`);
            return true;
        } else {
            console.log('[!] Запрос не удался.');
            return false;
        }
    } catch (error) {
        console.error('[!] Ошибка при отправке запроса:', error.response ? error.response.data : error.message);
        return false;
    }
}

// Основная функция
async function main() {
    packageJSON = await readJsonFile('package.json');
    config = await readJsonFile('config.json');

    postUrl = `https://${config.domain}/api/jab-tap/frog/tap`;
    getUrl = `https://${config.domain}/api/jab-tap/frog`;

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
    };

    postBody = {
        tapsCount: config.tapsCount
    };

    console.log(`====================================`);
    console.log(`[        JabTap AutoClicker        ]`);
    console.log(`====================================`);
    console.log(`|   Автор: ${packageJSON.author}`);
    console.log(`|   Версия: ${packageJSON.version}`);
    console.log(`====================================`);
    console.log(`» Проверка авторизации...`);

    const isAuthorized = await checkAuthorization();

    if (!isAuthorized) {
        console.error('[!] Скрипт остановлен из-за неудачной авторизации.');
        return;
    }

    const energyCheckInterval = 5000; // Интервал для проверки статистики (в миллисекундах)

    // Таймер для обновления статистики
    setInterval(async () => {
        if (energyOk) {
            await printStats(); // Обновляем статистику через интервал
        }
    }, energyCheckInterval);

    // Основной цикл отправки запросов
    while (true) {
        if (!energyOk) {
            console.log(`» Энергия закончилась, кликер приостановлен, повторная попытка через ${energyCheckInterval} мс.`);
            await delay(energyCheckInterval);
            continue;
        }

        const success = await sendRequest();

        if (!success) {
            console.log('[!] Запрос не удался. Выход из цикла.');
            break;
        }

        await delay(config.clickDelay); // Задержка перед следующим POST-запросом
    }

    console.log('Конечное состояние достигнуто. Завершение.');
}

main();
