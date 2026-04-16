// ================== KONFIGURASI MQTT ==================
const MQTT_BROKER = "wss://broker.emqx.io:8084/mqtt";
const MQTT_TOPIC = "gas_sensor/data";

let mqttClient = null;
let isMqttConnected = false;

// Chart Configuration
const MAX_POINTS = 20;
const MAX_TEMP = 50;
const MAX_HUM = 100;
const MAX_GAS = 1200;
const THRESHOLD_GAS = 800;

let timeLabels = [];
let tempData = [];
let humData = [];
let gasData = [];

// DOM Elements
const tempSpan = document.getElementById('tempValue');
const humSpan = document.getElementById('humValue');
const gasSpan = document.getElementById('gasValue');
const tempBar = document.getElementById('tempBar');
const humBar = document.getElementById('humBar');
const gasBar = document.getElementById('gasBar');
const tempTrendSpan = document.getElementById('tempTrend');
const humTrendSpan = document.getElementById('humTrend');
const gasStatusSpan = document.getElementById('gasStatus');
const gasLight = document.getElementById('gasWarningLight');
const cardGas = document.getElementById('cardGas');
const tempChartValue = document.getElementById('tempChartValue');
const humidityChartValue = document.getElementById('humidityChartValue');
const gasChartValue = document.getElementById('gasChartValue');
const mqttStatusText = document.getElementById('mqttStatusText');
const mqttStatusDot = document.getElementById('mqttStatusDot');
const logContent = document.getElementById('logContent');

let prevTemp = null, prevHum = null;
let counter = 0;

// ================== INIT CHARTS ==================
const tempCtx = document.getElementById('tempChart').getContext('2d');
const humCtx = document.getElementById('humChart').getContext('2d');
const gasCtx = document.getElementById('gasChart').getContext('2d');

const tempChart = new Chart(tempCtx, {
    type: 'line',
    data: { labels: timeLabels, datasets: [{ label: 'Suhu (°C)', data: tempData, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.05)', borderWidth: 2.5, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, fill: true }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { y: { min: 0, max: 50, ticks: { stepSize: 10 } }, x: { ticks: { font: { size: 9 } } } } }
});

const humChart = new Chart(humCtx, {
    type: 'line',
    data: { labels: timeLabels, datasets: [{ label: 'Kelembapan (%)', data: humData, borderColor: '#38bdf8', backgroundColor: 'rgba(56, 189, 248, 0.05)', borderWidth: 2.5, tension: 0.3, pointRadius: 0, pointHoverRadius: 5, fill: true }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { y: { min: 0, max: 100, ticks: { stepSize: 20 } }, x: { ticks: { font: { size: 9 } } } } }
});

const gasChart = new Chart(gasCtx, {
    type: 'line',
    data: { labels: timeLabels, datasets: [{ label: 'Gas (ppm)', data: gasData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.05)', borderWidth: 2.5, tension: 0.2, pointRadius: 0, pointHoverRadius: 5, fill: true }] },
    options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { y: { min: 0, max: 1200, ticks: { stepSize: 200 } }, x: { ticks: { font: { size: 9 } } } } }
});

// ================== FUNCTIONS ==================
function addLog(message, type = 'info') {
    const logItem = document.createElement('div');
    logItem.className = `log-item log-${type}`;
    const time = new Date().toLocaleTimeString();
    logItem.innerHTML = `[${time}] ${message}`;
    logContent.insertBefore(logItem, logContent.firstChild);
    if (logContent.children.length > 50) {
        logContent.removeChild(logContent.lastChild);
    }
    console.log(`[${type}] ${message}`);
}

function updateMQTTStatus(connected) {
    isMqttConnected = connected;
    if (connected) {
        mqttStatusText.textContent = 'Terhubung';
        mqttStatusDot.classList.add('connected');
        addLog('MQTT Terhubung ke broker EMQX', 'success');
    } else {
        mqttStatusText.textContent = 'Terputus';
        mqttStatusDot.classList.remove('connected');
        addLog('MQTT Terputus, mencoba reconnect...', 'warning');
    }
}

function animateNumber(element, newVal) {
    if (element.innerText != newVal) {
        element.classList.add('number-updated');
        setTimeout(() => element.classList.remove('number-updated'), 300);
        element.innerText = newVal;
    }
}

function updateChartBadge(element, value, unit) {
    const newText = `${value}${unit}`;
    if (element.innerText !== newText) {
        element.classList.add('value-updated');
        setTimeout(() => element.classList.remove('value-updated'), 300);
        element.innerText = newText;
    }
}

function updateBar(barElement, value, maxValue) {
    let percent = (value / maxValue) * 100;
    percent = Math.min(100, Math.max(0, percent));
    barElement.style.height = percent + '%';
}

function updateGasAlert(isDanger) {
    if (isDanger) {
        cardGas.classList.add('gas-danger');
        gasStatusSpan.innerHTML = '<i class="fas fa-skull"></i> BAHAYA!';
        gasStatusSpan.style.color = '#fca5a5';
        gasLight.style.background = '#ef4444';
        addLog(`⚠️ PERINGATAN! Gas melebihi batas: ${gasSpan.innerText} ppm`, 'warning');
    } else {
        cardGas.classList.remove('gas-danger');
        gasStatusSpan.innerHTML = 'AMAN';
        gasStatusSpan.style.color = '#86efac';
        gasLight.style.background = '#475569';
    }
}

function updateTrends(temp, hum) {
    if (prevTemp !== null) {
        let diff = (temp - prevTemp).toFixed(1);
        tempTrendSpan.innerHTML = diff > 0 ? `▲ +${diff}°C` : (diff < 0 ? `▼ ${diff}°C` : '▬ 0.0°C');
    }
    if (prevHum !== null) {
        let diff = (hum - prevHum).toFixed(1);
        humTrendSpan.innerHTML = diff > 0 ? `▲ +${diff}%` : (diff < 0 ? `▼ ${diff}%` : '▬ 0%');
    }
    prevTemp = temp;
    prevHum = hum;
}

function updateDashboard(suhu, humidity, gas) {
    // Update Cards
    animateNumber(tempSpan, suhu);
    animateNumber(humSpan, humidity);
    animateNumber(gasSpan, gas);
    
    updateChartBadge(tempChartValue, suhu, '°C');
    updateChartBadge(humidityChartValue, humidity, '%');
    updateChartBadge(gasChartValue, gas, ' ppm');
    
    updateBar(tempBar, suhu, MAX_TEMP);
    updateBar(humBar, humidity, MAX_HUM);
    updateBar(gasBar, gas, MAX_GAS);
    
    updateTrends(suhu, humidity);
    updateGasAlert(gas > THRESHOLD_GAS);
    
    // Update Charts
    const newLabel = `${counter + 1}`;
    timeLabels.push(newLabel);
    tempData.push(suhu);
    humData.push(humidity);
    gasData.push(gas);
    
    if (timeLabels.length > MAX_POINTS) {
        timeLabels.shift();
        tempData.shift();
        humData.shift();
        gasData.shift();
    }
    
    tempChart.data.labels = [...timeLabels];
    tempChart.data.datasets[0].data = [...tempData];
    tempChart.update('none');
    
    humChart.data.labels = [...timeLabels];
    humChart.data.datasets[0].data = [...humData];
    humChart.update('none');
    
    gasChart.data.labels = [...timeLabels];
    gasChart.data.datasets[0].data = [...gasData];
    gasChart.update('none');
    
    counter++;
}

// ================== MQTT CONNECTION ==================
function connectMQTT() {
    if (mqttClient && isMqttConnected) {
        addLog('MQTT sudah terhubung', 'info');
        return;
    }
    
    addLog('Menghubungkan ke MQTT Broker EMQX...', 'info');
    
    const options = {
        keepalive: 60,
        clientId: `web_dashboard_${Math.random().toString(16).substring(2, 10)}`,
        protocolId: 'MQTT',
        protocolVersion: 4,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 30 * 1000,
    };
    
    mqttClient = mqtt.connect(MQTT_BROKER, options);
    
    mqttClient.on('connect', () => {
        updateMQTTStatus(true);
        mqttClient.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
            if (!err) {
                addLog(`Berhasil subscribe ke topic: ${MQTT_TOPIC}`, 'success');
            } else {
                addLog(`Gagal subscribe: ${err.message}`, 'error');
            }
        });
    });
    
    mqttClient.on('message', (topic, message) => {
        try {
            const data = JSON.parse(message.toString());
            // Format dari ESP32: {"suhu":25.0,"humidity":60,"gas":350}
            const suhu = data.suhu || data.temperature || 0;
            const humidity = data.humidity || 0;
            const gas = data.gas || 0;
            
            updateDashboard(suhu, humidity, gas);
            
            // Log setiap 5 detik sekali (kurangi spam)
            if (Math.random() > 0.9) {
                addLog(`Data: Suhu=${suhu}°C, Humidity=${humidity}%, Gas=${gas}ppm`, 'success');
            }
        } catch (e) {
            console.error('Parse error:', e);
        }
    });
    
    mqttClient.on('error', (err) => {
        addLog(`MQTT Error: ${err.message}`, 'error');
        updateMQTTStatus(false);
    });
    
    mqttClient.on('close', () => {
        updateMQTTStatus(false);
    });
    
    mqttClient.on('reconnect', () => {
        addLog('Mencoba reconnect ke MQTT...', 'warning');
    });
}

// ================== THEME MANAGEMENT ==================
function loadThemePreference() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    } else {
        document.body.classList.add('dark-mode');
    }
    updateChartsTheme();
}

function toggleTheme() {
    if (document.body.classList.contains('dark-mode')) {
        document.body.classList.remove('dark-mode');
        localStorage.setItem('theme', 'light');
        addLog('Mode terang diaktifkan', 'info');
    } else {
        document.body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        addLog('Mode gelap diaktifkan', 'info');
    }
    updateChartsTheme();
}

function updateChartsTheme() {
    const isLight = !document.body.classList.contains('dark-mode');
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.05)';
    const textColor = isLight ? '#64748b' : '#94a3b8';
    
    [tempChart, humChart, gasChart].forEach(chart => {
        if (chart) {
            chart.options.scales.x.grid.color = gridColor;
            chart.options.scales.y.grid.color = gridColor;
            chart.options.scales.x.ticks.color = textColor;
            chart.options.scales.y.ticks.color = textColor;
            chart.update('none');
        }
    });
}

// ================== INITIALIZATION ==================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize empty data
    for (let i = 0; i < MAX_POINTS; i++) {
        timeLabels.push(`${i + 1}`);
        tempData.push(0);
        humData.push(0);
        gasData.push(0);
    }
    tempChart.update();
    humChart.update();
    gasChart.update();
    counter = MAX_POINTS;
    
    // Connect to MQTT
    connectMQTT();
    
    // Theme toggle
    const themeToggleBtn = document.getElementById('themeToggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }
    
    // Clear log button
    const clearLogBtn = document.getElementById('clearLogBtn');
    if (clearLogBtn) {
        clearLogBtn.addEventListener('click', () => {
            logContent.innerHTML = '<div class="log-item log-info">Log dibersihkan</div>';
        });
    }
    
    loadThemePreference();
    addLog('Dashboard siap, menunggu data dari ESP32 via MQTT...', 'info');
});

// Resize handler
window.addEventListener('resize', () => {
    tempChart.resize();
    humChart.resize();
    gasChart.resize();
});