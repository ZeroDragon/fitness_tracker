const { createApp, ref, onMounted, computed, watch, nextTick } = Vue;

createApp({
    setup() {
        const events = ref([]);
        const loading = ref(false);
        const error = ref(null);
        const currentDate = ref(new Date());
        const chartInstance = ref(null);
        const selectedEvent = ref(null);

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

        // API URL
        const apiUrl = 'https://n8n.floresbenavides.com/webhook/events';

        // Fetch events
        const fetchEvents = async () => {
            loading.value = true;
            error.value = null;
            try {
                const dateParam = formatDateForApi(currentDate.value);
                const url = `${apiUrl}?date=${dateParam}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('Failed to fetch events');
                }
                events.value = await response.json();
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

            // Prepare labels from glucose readings
            const labels = glucoseData.map(r =>
                r.timestamp.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
            );
            const glucoseValues = glucoseData.map(r => r.value);

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

            // Create scatter dataset for other events
            const scatterData = otherEvents.map(event => {
                // Find the closest glucose reading to place the event point
                const closestGlucose = glucoseData.reduce((closest, reading) => {
                    const diff = Math.abs(reading.timestamp - event.timestamp);
                    const closestDiff = Math.abs(closest.timestamp - event.timestamp);
                    return diff < closestDiff ? reading : closest;
                }, glucoseData[0]);

                // Use the index of the closest glucose reading for x position
                const xIndex = glucoseData.indexOf(closestGlucose);

                return {
                    x: xIndex >= 0 ? xIndex : 0,
                    y: closestGlucose ? closestGlucose.value : 100,
                    event: event
                };
            });

            // Datasets
            const datasets = [
                {
                    type: 'line',
                    label: 'Glucosa (mg/dL)',
                    data: glucoseValues,
                    borderColor: '#2ac3de',
                    backgroundColor: 'rgba(42, 195, 222, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#2ac3de',
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    pointHoverRadius: 6
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
                    pointStyle: 'triangle'
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
                        title: {
                            display: true,
                            text: 'Hora',
                            color: '#a9b1d6'
                        },
                        ticks: {
                            color: '#a9b1d6'
                        },
                        grid: {
                            color: 'rgba(65, 72, 104, 0.5)'
                        }
                    },
                    y: {
                        min: 40,
                        max: 250,
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
                        callbacks: {
                            label: function(context) {
                                if (context.dataset.type === 'scatter') {
                                    const event = context.raw.event;
                                    return `${event.type}: ${event.desc}`;
                                }
                                return `${context.dataset.label}: ${context.parsed.y} mg/dL`;
                            }
                        }
                    },
                    annotation: {
                        annotations: {
                            sweetZone: {
                                type: 'box',
                                yMin: 60,
                                yMax: 180,
                                backgroundColor: 'rgba(158, 206, 106, 0.15)',
                                borderColor: 'rgba(158, 206, 106, 0.3)',
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

        // Watch for date changes
        watch(currentDate, () => {
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
            otherEvents
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
                    <div v-if="selectedEvent" class="event-item" :class="selectedEvent.type">
                        <div>
                            <span class="event-type" :class="selectedEvent.type">{{ selectedEvent.type }}</span>
                            <span class="event-time">{{ selectedEvent.timestamp.toLocaleTimeString('es-ES') }}</span>
                        </div>
                        <div class="event-desc">{{ selectedEvent.desc }}</div>
                        <div class="date-btn" style="margin-top: var(--spacing-xs);" @click="selectedEvent = null">
                            Cerrar
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
