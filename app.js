const { createApp, ref, onMounted, computed, watch, nextTick } = Vue;

createApp({
    setup() {
        const events = ref([]);
        const loading = ref(false);
        const error = ref(null);
        const currentDate = ref(new Date());
        const chartInstance = ref(null);
        const selectedEvent = ref(null);
        const sweetSpotChart = ref(null);
        const perfectSpotChart = ref(null);
        const zones = {
            sweetSpot: { min: 60, max: 180 },
            perfectSpot: { min: 80, max: 120 }
        };

        // Format date for API
        const formatDateForApi = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // Format date for display
        const formatDateForDisplay = (date) => {
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            return date.toLocaleDateString('es-ES', options);
        };

        // Get date from URL query parameter
        const getDateFromUrl = () => {
            const urlParams = new URLSearchParams(window.location.search);
            const dateParam = urlParams.get('date');
            if (dateParam) {
                const [year, month, day] = dateParam.split('-').map(Number);
                const date = new Date(year, month - 1, day);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            return new Date();
        };

        // Update URL with current date
        const updateUrlDate = () => {
            const dateParam = formatDateForApi(currentDate.value);
            const url = new URL(window.location.href);
            url.searchParams.set('date', dateParam);
            window.history.replaceState({}, '', url.toString());
        };

        // Set initial date from URL
        currentDate.value = getDateFromUrl();

        // API URL
        const apiUrl = 'https://n8n.floresbenavides.com/webhook/events';

        // Fetch events
        const fetchEvents = async () => {
            loading.value = true;
            error.value = null;
            // Clear previous data immediately
            events.value = [];
            // Destroy existing chart
            if (chartInstance.value) {
                chartInstance.value.destroy();
                chartInstance.value = null;
            }
            try {
                const dateParam = formatDateForApi(currentDate.value);
                const url = `${apiUrl}?date=${dateParam}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('Failed to fetch events');
                }
                const responseData = await response.json();
                // Extract items from the new response structure
                events.value = responseData[0]?.items || [];
            } catch (err) {
                error.value = err.message;
                events.value = [];
            } finally {
                loading.value = false;
                // Wait for DOM to update before rendering chart
                await nextTick();
                updateChart();
            }
        };

        // Navigate dates
        const previousDay = () => {
            const newDate = new Date(currentDate.value);
            newDate.setDate(newDate.getDate() - 1);
            currentDate.value = newDate;
        };

        const nextDay = () => {
            const newDate = new Date(currentDate.value);
            newDate.setDate(newDate.getDate() + 1);
            currentDate.value = newDate;
        };

        const goToToday = () => {
            currentDate.value = new Date();
        };

        // Chart colors by type
        const getEventColor = (type) => {
            const colors = {
                food: '#ff9e64',
                gym: '#9ece6a',
                medicine: '#bb9af7'
            };
            return colors[type] || '#7aa2f7';
        };

        // Initialize or update chart
        const updateChart = () => {
            const ctx = document.getElementById('glucoseChart');
            if (!ctx) return;

            if (chartInstance.value) {
                chartInstance.value.destroy();
            }

            // Prepare glucose readings data
            const glucoseData = events.value
                .filter(event => event.type === 'glucose_reading')
                .map(event => {
                    // Parse timestamp - the server sends UTC but it's actually already local time (Mexico)
                    // Remove the 'Z' to prevent JS from treating it as UTC
                    const timestampStr = event.timestamp.replace('Z', '');
                    return {
                        value: parseFloat(event.desc),
                        timestamp: new Date(timestampStr)
                    };
                })
                .sort((a, b) => a.timestamp - b.timestamp);

            if (glucoseData.length === 0) {
                if (chartInstance.value) {
                    chartInstance.value.destroy();
                    chartInstance.value = null;
                }
                return;
            }

            // Prepare labels from glucose readings - use timestamps
            const labels = glucoseData.map(r => r.timestamp);
            const glucoseValues = glucoseData.map(r => r.value);

            // Create x,y pairs for glucose line
            const glucoseDataPoints = glucoseData.map(r => ({
                x: r.timestamp.getTime(),
                y: r.value
            }));

            // Prepare other events as scatter points
            const otherEvents = events.value
                .filter(event => event.type !== 'glucose_reading')
                .map(event => {
                    // Parse timestamp - the server sends UTC but it's actually already local time (Mexico)
                    const timestampStr = event.timestamp.replace('Z', '');
                    return {
                        ...event,
                        timestamp: new Date(timestampStr),
                        color: getEventColor(event.type)
                    };
                })
                .sort((a, b) => a.timestamp - b.timestamp);

            // Get min and max timestamps for chart bounds
            const allTimestamps = [...glucoseData.map(r => r.timestamp.getTime()), ...otherEvents.map(e => e.timestamp.getTime())];
            const minTimestamp = Math.min(...allTimestamps);
            const maxTimestamp = Math.max(...allTimestamps);
            // Add some padding (2 minutes on each side)
            const padding = 2 * 60 * 1000; // 2 minutes in milliseconds

            // Calculate Y-axis max - max glucose value or 200, whichever is greater
            const maxY = glucoseValues.length > 0 ? Math.max(Math.max(...glucoseValues), 200) : 200;

            // Create scatter dataset for other events - use actual timestamp for x position
            const scatterData = otherEvents.map(event => {
                // Find closest glucose reading by timestamp
                const eventTimestamp = event.timestamp.getTime();
                let closestGlucose = null;
                let minDiff = Infinity;

                glucoseData.forEach(glucose => {
                    const diff = Math.abs(glucose.timestamp.getTime() - eventTimestamp);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestGlucose = glucose;
                    }
                });

                const yValue = closestGlucose ? closestGlucose.value : 40;

                return {
                    x: eventTimestamp,
                    y: yValue,
                    event: event
                };
            });

            // Datasets
            const datasets = [
                {
                    type: 'line',
                    label: 'Glucosa (mg/dL)',
                    data: glucoseDataPoints,
                    borderColor: '#2ac3de',
                    backgroundColor: 'rgba(42, 195, 222, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0,
                    order: 1,
                    pointBackgroundColor: '#2ac3de',
                    pointBorderColor: 'transparent',
                    pointRadius: 1,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: '#2ac3de',
                    pointHoverBorderColor: '#fff'
                }
            ];

            if (scatterData.length > 0) {
                datasets.push({
                    type: 'scatter',
                    label: 'Eventos',
                    data: scatterData,
                    backgroundColor: scatterData.map(d => d.color),
                    pointRadius: 10,
                    pointHoverRadius: 12,
                    pointStyle: 'triangle',
                    pointBackgroundColor: '#ab2ade',
                    order: 0
                });
            }

            // Chart options
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'nearest',
                    intersect: true
                },
                scales: {
                    x: {
                        type: 'linear',
                        min: minTimestamp - padding,
                        max: maxTimestamp + padding,
                        title: {
                            display: true,
                            text: 'Hora',
                            color: '#a9b1d6'
                        },
                        ticks: {
                            color: '#a9b1d6',
                            callback: function(value) {
                                const date = new Date(value);
                                return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                            }
                        },
                        grid: {
                            color: 'rgba(65, 72, 104, 0.5)'
                        }
                    },
                    y: {
                        min: 40,
                        max: maxY,
                        title: {
                            display: true,
                            text: 'Glucosa (mg/dL)',
                            color: '#a9b1d6'
                        },
                        ticks: {
                            color: '#a9b1d6'
                        },
                        grid: {
                            color: 'rgba(65, 72, 104, 0.5)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            color: '#c0caf5'
                        }
                    },
                    tooltip: {
                        backgroundColor: '#24283b',
                        titleColor: '#c0caf5',
                        bodyColor: '#a9b1d6',
                        borderColor: '#414868',
                        borderWidth: 1,
                        padding: 12,
                        bodyFont: {
                            size: 13,
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif'
                        },
                        titleFont: {
                            size: 14,
                            weight: 'bold',
                            family: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif'
                        },
                        boxPadding: 6,
                        callbacks: {
                            title: function(context) {
                                const timestamp = context[0].parsed.x;
                                const date = new Date(timestamp);
                                return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                            },
                            label: function(context) {
                                if (context.dataset.type === 'scatter') {
                                    const event = context.raw.event;
                                    const text = `${event.type}: ${event.desc}`;
                                    // Word wrap: split into multiple lines if too long
                                    const maxCharsPerLine = 50;
                                    if (text.length > maxCharsPerLine) {
                                        const words = text.split(' ');
                                        const lines = [];
                                        let currentLine = '';

                                        words.forEach(word => {
                                            if ((currentLine + ' ' + word).length <= maxCharsPerLine) {
                                                currentLine += (currentLine ? ' ' : '') + word;
                                            } else {
                                                if (currentLine) lines.push(currentLine);
                                                currentLine = word;
                                            }
                                        });
                                        if (currentLine) lines.push(currentLine);

                                        return lines;
                                    }
                                    return text;
                                }
                                return context.parsed.y.toString();
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            sweetZone: {
                                type: 'box',
                                yMin: zones.sweetSpot.min,
                                yMax: zones.sweetSpot.max,
                                backgroundColor: 'transparent',
                                borderColor: 'rgba(158, 206, 106, 0.3)',
                                borderWidth: 2
                            },
                            perfectZone: {
                                type: 'box',
                                yMin: zones.perfectSpot.min,
                                yMax: zones.perfectSpot.max,
                                backgroundColor: 'transparent',
                                borderColor: 'rgba(42, 195, 222, 0.3)',
                                borderWidth: 2
                            }
                        }
                    }
                },
                onClick: (event, elements) => {
                    if (elements.length > 0) {
                        const element = elements[0];
                        const dataset = chartInstance.value.data.datasets[element.datasetIndex];

                        if (dataset.type === 'scatter') {
                            const scatterData = dataset.data[element.index];
                            selectedEvent.value = scatterData.event;
                        }
                    }
                }
            };

            chartInstance.value = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: chartOptions
            });

            // Create pie charts
            updatePieCharts();
        };

        // Create pie charts for sweet spot and perfect spot
        const updatePieCharts = () => {
            // Sweet spot chart (60-180)
            const sweetCtx = document.getElementById('sweetSpotChart');
            if (sweetCtx) {
                if (sweetSpotChart.value) {
                    sweetSpotChart.value.destroy();
                }

                sweetSpotChart.value = new Chart(sweetCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Dentro', 'Arriba', 'Abajo'],
                        datasets: [{
                            data: [sweetSpotStats.value.inRange, sweetSpotStats.value.aboveRange, sweetSpotStats.value.belowRange],
                            backgroundColor: ['#9ece6a', '#f7768e', '#2ac3de'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = sweetSpotStats.value.total;
                                        const value = context.parsed;
                                        const percentage = ((value / total) * 100).toFixed(1);
                                        return `${context.label}: ${value} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // Perfect spot chart
            const perfectCtx = document.getElementById('perfectSpotChart');
            if (perfectCtx) {
                if (perfectSpotChart.value) {
                    perfectSpotChart.value.destroy();
                }

                perfectSpotChart.value = new Chart(perfectCtx, {
                    type: 'doughnut',
                    data: {
                        labels: ['Dentro', 'Arriba', 'Abajo'],
                        datasets: [{
                            data: [perfectSpotStats.value.inRange, perfectSpotStats.value.aboveRange, perfectSpotStats.value.belowRange],
                            backgroundColor: ['#9ece6a', '#f7768e', '#2ac3de'],
                            borderWidth: 0
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: true,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const total = perfectSpotStats.value.total;
                                        const value = context.parsed;
                                        const percentage = ((value / total) * 100).toFixed(1);
                                        return `${context.label}: ${value} (${percentage}%)`;
                                    }
                                }
                            }
                        }
                    }
                });
            }
        };

        // Computed properties
        const glucoseReadings = computed(() => {
            return events.value
                .filter(event => event.type === 'glucose_reading')
                .map(event => {
                    // Parse timestamp - the server sends UTC but it's actually already local time (Mexico)
                    const timestampStr = event.timestamp.replace('Z', '');
                    return {
                        value: parseFloat(event.desc),
                        timestamp: new Date(timestampStr)
                    };
                })
                .sort((a, b) => a.timestamp - b.timestamp);
        });

        const otherEvents = computed(() => {
            return events.value
                .filter(event => event.type !== 'glucose_reading')
                .map(event => {
                    // Parse timestamp - the server sends UTC but it's actually already local time (Mexico)
                    const timestampStr = event.timestamp.replace('Z', '');
                    return {
                        ...event,
                        timestamp: new Date(timestampStr)
                    };
                })
                .sort((a, b) => a.timestamp - b.timestamp);
        });

        // Glucose statistics
        const maxGlucose = computed(() => {
            const values = glucoseReadings.value.map(r => r.value);
            return values.length > 0 ? Math.max(...values).toFixed(0) : '-';
        });

        const minGlucose = computed(() => {
            const values = glucoseReadings.value.map(r => r.value);
            return values.length > 0 ? Math.min(...values).toFixed(0) : '-';
        });

        const avgGlucose = computed(() => {
            const values = glucoseReadings.value.map(r => r.value);
            if (values.length === 0) return '-';
            const sum = values.reduce((a, b) => a + b, 0);
            return (sum / values.length).toFixed(0);
        });

        // Sweet spot statistics
        const sweetSpotStats = computed(() => {
            const readings = glucoseReadings.value;
            const inRange = readings.filter(r => r.value >= zones.sweetSpot.min && r.value <= zones.sweetSpot.max).length;
            const aboveRange = readings.filter(r => r.value > zones.sweetSpot.max).length;
            const belowRange = readings.filter(r => r.value < zones.sweetSpot.min).length;
            return { inRange, aboveRange, belowRange, total: readings.length };
        });

        const sweetSpotInCount = computed(() => sweetSpotStats.value.inRange);
        const sweetSpotAboveCount = computed(() => sweetSpotStats.value.aboveRange);
        const sweetSpotBelowCount = computed(() => sweetSpotStats.value.belowRange);

        // Perfect spot statistics
        const perfectSpotStats = computed(() => {
            const readings = glucoseReadings.value;
            const inRange = readings.filter(r => r.value >= zones.perfectSpot.min && r.value <= zones.perfectSpot.max).length;
            const aboveRange = readings.filter(r => r.value > zones.perfectSpot.max).length;
            const belowRange = readings.filter(r => r.value < zones.perfectSpot.min).length;
            return { inRange, aboveRange, belowRange, total: readings.length };
        });

        const perfectSpotInCount = computed(() => perfectSpotStats.value.inRange);
        const perfectSpotAboveCount = computed(() => perfectSpotStats.value.aboveRange);
        const perfectSpotBelowCount = computed(() => perfectSpotStats.value.belowRange);

        // Watch for date changes
        watch(currentDate, () => {
            updateUrlDate();
            fetchEvents();
        });

        // Lifecycle
        onMounted(() => {
            fetchEvents();
        });

        return {
            events,
            loading,
            error,
            currentDate,
            selectedEvent,
            formatDateForDisplay,
            previousDay,
            nextDay,
            goToToday,
            glucoseReadings,
            otherEvents,
            maxGlucose,
            minGlucose,
            avgGlucose,
            sweetSpotInCount,
            sweetSpotAboveCount,
            sweetSpotBelowCount,
            perfectSpotInCount,
            perfectSpotAboveCount,
            perfectSpotBelowCount,
            zones
        };
    },
    template: `
        <div>
            <header>
                <h1>Fitness Tracker</h1>
            </header>

            <main>
                <section class="section">
                    <h2 class="section-title">Glucose Tracker</h2>

                    <!-- Date Controls -->
                    <div class="date-controls">
                        <button class="date-btn" @click="previousDay">← Anterior</button>
                        <span class="date-display">{{ formatDateForDisplay(currentDate) }}</span>
                        <button class="date-btn" @click="nextDay">Siguiente →</button>
                    </div>
                    <div class="date-controls">
                        <button class="date-btn" @click="goToToday">Hoy</button>
                    </div>

                    <!-- Loading State -->
                    <div v-if="loading" class="loading">
                        Cargando datos...
                    </div>

                    <!-- Error State -->
                    <div v-if="error" class="error">
                        {{ error }}
                    </div>

                    <!-- Chart -->
                    <div v-show="!loading && !error && glucoseReadings.length > 0" class="chart-container">
                        <canvas id="glucoseChart"></canvas>
                    </div>

                    <!-- No Data -->
                    <div v-if="!loading && !error && glucoseReadings.length === 0" class="loading">
                        <p>No hay datos de glucosa para esta fecha</p>
                        <p v-if="events.length > 0" style="margin-top: var(--spacing-sm); font-size: 0.9rem; color: var(--text-secondary);">
                            Se encontraron {{ events.length }} evento(s) pero sin lecturas de glucosa
                        </p>
                    </div>

                    <!-- Selected Event Detail -->
                    <div v-if="selectedEvent" class="event-item selected-event" :class="selectedEvent.type">
                        <div>
                            <span class="event-type" :class="selectedEvent.type">{{ selectedEvent.type }}</span>
                            <span class="event-time">{{ selectedEvent.timestamp.toLocaleTimeString('es-ES') }}</span>
                        </div>
                        <div class="event-desc">{{ selectedEvent.desc }}</div>
                        <div class="date-btn" style="margin-top: var(--spacing-xs);" @click="selectedEvent = null">
                            Cerrar
                        </div>
                    </div>

                    <!-- Stats Section -->
                    <div v-if="!loading && !error && glucoseReadings.length > 0" class="stats-section">
                        <div class="stats-grid">
                            <!-- Glucose Stats -->
                            <div class="stats-card">
                                <h4 class="stats-title">Estadísticas de Glucosa</h4>
                                <div class="stats-values">
                                    <div class="stat-item">
                                        <span class="stat-label">Máximo</span>
                                        <span class="stat-value">{{ maxGlucose }}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Mínimo</span>
                                        <span class="stat-value">{{ minGlucose }}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Promedio</span>
                                        <span class="stat-value">{{ avgGlucose }}</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Sweet Spot Chart -->
                            <div class="stats-card">
                                <h4 class="stats-title">Sweet Spot ({{ zones.sweetSpot.min }}-{{ zones.sweetSpot.max }})</h4>
                                <div class="pie-chart-container">
                                    <canvas id="sweetSpotChart"></canvas>
                                </div>
                                <div class="chart-legend">
                                    <div class="legend-item">
                                        <span class="legend-color" style="background-color: #9ece6a;"></span>
                                        <span class="legend-label">Dentro ({{ sweetSpotInCount }})</span>
                                    </div>
                                    <div class="legend-item">
                                        <span class="legend-color" style="background-color: #f7768e;"></span>
                                        <span class="legend-label">Arriba ({{ sweetSpotAboveCount }})</span>
                                    </div>
                                    <div class="legend-item">
                                        <span class="legend-color" style="background-color: #2ac3de;"></span>
                                        <span class="legend-label">Abajo ({{ sweetSpotBelowCount }})</span>
                                    </div>
                                </div>
                            </div>

                            <!-- Perfect Spot Chart -->
                            <div class="stats-card">
                                <h4 class="stats-title">Perfect Spot ({{ zones.perfectSpot.min }}-{{ zones.perfectSpot.max }})</h4>
                                <div class="pie-chart-container">
                                    <canvas id="perfectSpotChart"></canvas>
                                </div>
                                <div class="chart-legend">
                                    <div class="legend-item">
                                        <span class="legend-color" style="background-color: #9ece6a;"></span>
                                        <span class="legend-label">Dentro ({{ perfectSpotInCount }})</span>
                                    </div>
                                    <div class="legend-item">
                                        <span class="legend-color" style="background-color: #f7768e;"></span>
                                        <span class="legend-label">Arriba ({{ perfectSpotAboveCount }})</span>
                                    </div>
                                    <div class="legend-item">
                                        <span class="legend-color" style="background-color: #2ac3de;"></span>
                                        <span class="legend-label">Abajo ({{ perfectSpotBelowCount }})</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Events List -->
                    <div v-if="otherEvents.length > 0" class="events-list">
                        <h3 style="color: var(--accent-blue); margin-bottom: var(--spacing-md);">Eventos del día</h3>
                        <div
                            v-for="(event, index) in otherEvents"
                            :key="index"
                            class="event-item"
                            :class="event.type"
                            @click="selectedEvent = event"
                            style="cursor: pointer;"
                        >
                            <div>
                                <span class="event-type" :class="event.type">{{ event.type }}</span>
                                <span class="event-time">{{ event.timestamp.toLocaleTimeString('es-ES') }}</span>
                            </div>
                            <div class="event-desc">{{ event.desc }}</div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    `
}).mount('#app');
