const axios = require('axios');
const { formatDistanceToNow, parseISO } = require('date-fns');
const fs = require('fs').promises;

let packageJSON;
let config;

let postUrl;
let getUrl;
let headers;
let postBody;

let initialBalance = 0;
let earnedThisSession = 0;
let clickCounter = 0;
let currentEnergy = 0;
let currentBalance = 0;
let currentExperience = 0;
let experienceToNextLevel = 0;
let totalEnergy = 0;
let levelName = '';
let nextRechargeAt = null;
let energyOk = true;

const energyCheckInterval = 5000; // Интервал проверки энергии в мс
const lowEnergyCheckInterval = 60000; // Увеличенный интервал проверки энергии, когда она закончилась
const statsUpdateInterval = 10; // Интервал обновления статистики по количеству кликов

async function readJsonFile(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`Ошибка при чтении ${filePath}:`, error.message);
        process.exit(1);
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkAuthorization() {
    try {
        const response = await axios.get(`${getUrl}?_=${Date.now()}`, { headers });
        const data = response.data;

        if (data && data.data && data.data.frog) {
            console.log(`» Успешная авторизация!`);
            console.log(`====================================`);
            console.log(`[        JabTap AutoClicker        ]`);
            console.log(`====================================`);
            console.log(`|   ID аккаунта: ${data.data.frog.user.id}`);
            console.log(`|   Никнейм: ${data.data.frog.user.nickname}`);
            console.log(`====================================`);
            console.log(`» Запускаем кликер...`);

            const frogData = data.data.frog;
            currentEnergy = frogData.remainingEnergy;
            currentBalance = parseFloat(frogData.balance);
            currentExperience = parseFloat(frogData.experience);
            totalEnergy = frogData.energyLevel.energy;
            experienceToNextLevel = parseFloat(frogData.level.requirement) - frogData.experience;
            levelName = frogData.level.name;
            nextRechargeAt = parseISO(frogData.nextRechargeAt);

            if (initialBalance === 0) {
                initialBalance = currentBalance;
            }

            return true;
        } else {
            console.error('[!] Авторизация не удалась.');
            return false;
        }
    } catch (error) {
        console.error('[!] Ошибка при проверке авторизации:', error.response ? error.response.data : error.message);
        return false;
    }
}

let previousEnergyOk = true; // Флаг для отслеживания предыдущего состояния энергии

async function checkEnergy() {
    try {
        const response = await axios.get(`${getUrl}?_=${Date.now()}`, { headers });
        const data = response.data;

        if (!data || !data.data || !data.data.frog) {
            console.error('[!] Не удалось получить данные из GET-запроса.');
            return;
        }

        const frogData = data.data.frog;
        currentEnergy = frogData.remainingEnergy;
        currentBalance = parseFloat(frogData.balance);
        currentExperience = parseFloat(frogData.experience);
        totalEnergy = frogData.energyLevel.energy;
        experienceToNextLevel = parseFloat(frogData.level.requirement) - frogData.experience;
        levelName = frogData.level.name;
        nextRechargeAt = parseISO(frogData.nextRechargeAt);

        // Убедимся, что энергия выше нуля перед попыткой клика
        energyOk = currentEnergy > 0;

        if (energyOk && !previousEnergyOk) {
            // Энергия восстановлена
            clearInterval(energyCheckTimer); // Очищаем увеличенный интервал
            energyCheckTimer = setInterval(checkEnergy, energyCheckInterval); // Восстанавливаем стандартный интервал
            console.log(`» Энергия восстановлена! Возобновление работы кликера.`);
        } else if (!energyOk && previousEnergyOk) {
            // Энергия закончилась
            clearInterval(energyCheckTimer); // Очищаем старый интервал
            energyCheckTimer = setInterval(checkEnergy, lowEnergyCheckInterval); // Устанавливаем увеличенный интервал
            const timeUntilRecharge = formatDistanceToNow(nextRechargeAt, { includeSeconds: true });
            console.log(`» Энергия закончилась. Проверка возобновится через ${timeUntilRecharge}.`);
        }

        // Обновляем флаг состояния энергии
        previousEnergyOk = energyOk;

    } catch (error) {
        console.error('[!] Ошибка при проверке уровня энергии:', error.response ? error.response.data : error.message);
    }
}

async function sendRequest() {
    if (currentEnergy <= 0) {
        energyOk = false;
        return false;
    }

    const adjustedTapsCount = Math.min(config.tapsCount, currentEnergy);
    postBody.tapsCount = adjustedTapsCount;

    try {
        const response = await axios.post(postUrl, postBody, { headers });
        const { data } = response;

        if (data.success === true) {
            clickCounter++;
            currentBalance += adjustedTapsCount;
            currentExperience += adjustedTapsCount;
            currentEnergy -= adjustedTapsCount;
            experienceToNextLevel -= adjustedTapsCount;
            console.log(`» Click: +${adjustedTapsCount} MUH`);
            return true;
        } else {
            console.log('[!] Запрос завершился неудачно.');
            return false;
        }
    } catch (error) {
        console.error('[!] Ошибка при отправке запроса:', error.response ? error.response.data : error.message);
        // Продолжаем работу даже при ошибке
        return true; // возвращаем true, чтобы не выйти из цикла
    }
}

async function updateStats() {
    earnedThisSession = currentBalance - initialBalance;
    const timeUntilRecharge = formatDistanceToNow(nextRechargeAt, { includeSeconds: true });

    console.log('');
    console.log(`====================================`);
    console.log(`[        JabTap AutoClicker        ]`);
    console.log(`====================================`);
    console.log(`|   Уровень: [${levelName}] | EXP: ${Math.floor(currentExperience)}/${Math.ceil(currentExperience + experienceToNextLevel)}`);
    console.log(`|   Энергия: ${currentEnergy}/${totalEnergy}`);
    console.log(`|   Текущий баланс: ${Math.floor(currentBalance)} MUH`);
    console.log(`|   Заработано за сессию: ${Math.floor(earnedThisSession.toFixed(2))} MUH`);
    console.log(`====================================`);
    console.log('» Обновление энергии через:', timeUntilRecharge);
    console.log('');
}

async function main() {
    packageJSON = await readJsonFile('package.json');
    config = await readJsonFile('config.json');

    postUrl = `https://${config.domain}/api/jab-tap/frog/tap`;
    getUrl = `https://${config.domain}/api/jab-tap/frog`;

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0',
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Authorization': config.token
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

    // Обновляем статистику сразу после авторизации
    await updateStats();

    energyCheckTimer = setInterval(checkEnergy, energyCheckInterval);

    let clickCounter = 0; // Счетчик кликов

    while (true) {
        // Обновляем информацию о текущей энергии
        await checkEnergy();

        // Если энергии недостаточно, приостанавливаем цикл
        if (!energyOk) {
            await delay(energyCheckInterval);
            continue;
        }

        // Пытаемся отправить запрос на клик
        const success = await sendRequest();

        if (!success) {
            console.log('[!] Запрос не удался. Продолжаем попытки...');
            continue; // продолжаем попытки, даже если запрос не удался
        }

        clickCounter++;

        // Обновляем статистику каждые 10 кликов
        if (clickCounter % statsUpdateInterval === 0) {
            await updateStats();
        }

        // Ожидание перед следующим кликом
        await delay(config.clickDelay);
    }

    console.log('Конечное состояние достигнуто. Завершение.');
}

main();
