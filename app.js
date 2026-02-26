const { createApp, ref, onMounted, onUnmounted, computed, watch, nextTick } = Vue;

createApp({
    setup() {
        // Helper functions
        const formatDateForApi = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const currentSection = ref('glucose');
        const weightText = ref('');
        const weightItems = ref([]);
        const weightDate = ref(formatDateForApi(new Date()));
        const unmatchedBlocks = ref([]);
        const bodyStats = ref([]);

        // Calculate previous Monday
        const getPreviousMonday = () => {
            const today = new Date();
            const day = today.getUTCDay();
            const diff = day === 0 ? 6 : day - 1;
            const monday = new Date(today);
            monday.setUTCDate(today.getUTCDate() - diff);
            return formatDateForApi(monday);
        };

        const bodyStatsFromDate = ref(getPreviousMonday());
        const bodyStatsLoading = ref(false);
        const bodyStatsError = ref(null);
        const events = ref([]);
        const loading = ref(false);
        const error = ref(null);
        const currentDate = ref(new Date());
        const chartInstance = ref(null);
        const selectedEvent = ref(null);
        const sweetSpotChart = ref(null);
        const perfectSpotChart = ref(null);
        const timeThreshold = ref(30);
        const thresholdDisplay = ref(30);
        const isAutoRefreshing = ref(false);
        const autoRefreshInterval = ref(null);
        const zoomLevel = ref('all');
        const zoomWindowStart = ref(0);
        const fullDataRange = ref({ min: 0, max: 0 });
        const zones = {
            sweetSpot: { min: 60, max: 180 },
            perfectSpot: { min: 80, max: 120 }
        };

        // Authentication
        const authToken = ref(localStorage.getItem('authToken') || '');
        const loginUsername = ref('');
        const loginPassword = ref('');
        const loginError = ref('');
        const showLoginModal = ref(false);

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

        const setThreshold = (value) => {
            thresholdDisplay.value = value;
            timeThreshold.value = value;
        };

        // Reload current day's data
        const reloadData = () => {
            fetchEvents();
        };

        // Fetch body stats
        const fetchBodyStats = async () => {
            bodyStatsLoading.value = true;
            bodyStatsError.value = null;
            try {
                const url = `https://n8n.floresbenavides.com/webhook/bodyStats?from=${bodyStatsFromDate.value}`;
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error('Failed to fetch body stats');
                }
                bodyStats.value = await response.json();
            } catch (err) {
                bodyStatsError.value = err.message;
                bodyStats.value = [];
            } finally {
                bodyStatsLoading.value = false;
            }
        };

        // Toggle auto-refresh
        const toggleAutoRefresh = () => {
            isAutoRefreshing.value = !isAutoRefreshing.value;

            if (isAutoRefreshing.value) {
                // Start auto-refresh every minute
                autoRefreshInterval.value = setInterval(() => {
                    fetchEvents();
                }, 60000);
            } else {
                // Stop auto-refresh
                if (autoRefreshInterval.value) {
                    clearInterval(autoRefreshInterval.value);
                    autoRefreshInterval.value = null;
                }
            }
        };

        // Weight tracking types
        const weightTypes = [
            'Peso',
            'BMI',
            'Grasa',
            'Peso de grasa corporal',
            'Porcentaje de masa muscular esquelética',
            'Peso de la masa muscular esquelética',
            'Músculo',
            'Peso muscular',
            'Grasa Visceral',
            'Agua (%)',
            'Peso del agua',
            'Metabolismo'
        ];

        // Unit indicators for each type
        const weightUnits = {
            'Peso': 'Kg',
            'BMI': 'I',
            'Grasa': '%',
            'Peso de grasa corporal': 'Kg',
            'Porcentaje de masa muscular esquelética': '%',
            'Peso de la masa muscular esquelética': 'Kg',
            'Músculo': '%',
            'Peso muscular': 'Kg',
            'Grasa Visceral': '%',
            'Agua (%)': '%',
            'Peso del agua': 'Kg',
            'Metabolismo': 'Kcal/día'
        };

        // Create normalized versions of types (without "(Kg)", "(%)", etc.)
        const getNormalizedTypes = () => {
            return weightTypes.map(type => ({
                original: type,
                normalized: type.replace(/\s*\([^)]*\)\s*$/g, '').toLowerCase().trim()
            }));
        };

        // Find matching type (prioritize more specific matches)
        const findMatchingType = (input) => {
            // Normalize input (remove units like "(Kg)", "(%)", etc.)
            const normalizedInput = input
                .replace(/^[\s(•]+\s*/, '') // Remove "( ", "• " at start
                .replace(/\s*[\)•]+\s*$/, '') // Remove ") ", "• " at end
                .replace(/\s*\([^)]*\)\s*$/g, '') // Remove "(Kg)", "(%)", etc. at end
                .replace(/\s*\/\s*\w+$/, '') // Remove " / dia", etc. at end
                .toLowerCase()
                .trim();

            // Get normalized types
            const normalizedTypes = getNormalizedTypes();

            // First, try exact match on normalized versions
            const exactMatch = normalizedTypes.find(nt => nt.normalized === normalizedInput);
            if (exactMatch) return exactMatch.original;

            // Find all partial matches with scores
            const matches = normalizedTypes.map(nt => {
                const typeContainsInput = nt.normalized.includes(normalizedInput);
                const inputContainsType = normalizedInput.includes(nt.normalized);

                if (!typeContainsInput && !inputContainsType) {
                    return null;
                }

                // Calculate match score
                let score = 0;

                // Bonus: type is fully contained in input (more specific)
                if (inputContainsType) {
                    score += 1000;
                    // Bonus proportional to how much of the input is covered by the type
                    score += (nt.normalized.length / normalizedInput.length) * 100;
                }

                // Bonus: input is contained in type (partial match)
                if (typeContainsInput) {
                    score += 500;
                    // Penalty for partial matches - shorter input in longer type is worse
                    score -= (normalizedInput.length / nt.normalized.length) * 50;
                }

                // Bonus: longer types are more specific
                score += nt.normalized.length * 10;

                // Bonus: common prefix at start
                const commonPrefix = getCommonPrefixLength(normalizedInput, nt.normalized);
                score += commonPrefix * 20;

                // Big penalty if input is just "peso" and type is longer "peso..."
                if (normalizedInput === 'peso' && nt.normalized !== 'peso') {
                    score -= 5000;
                }

                return { type: nt.original, score };
            }).filter(match => match !== null);

            // If no matches, return null
            if (matches.length === 0) return null;

            // Sort by score (highest first)
            const sortedMatches = matches.sort((a, b) => b.score - a.score);

            return sortedMatches[0].type;
        };

        // Helper function to get common prefix length
        const getCommonPrefixLength = (str1, str2) => {
            let i = 0;
            const minLen = Math.min(str1.length, str2.length);
            while (i < minLen && str1[i] === str2[i]) {
                i++;
            }
            return i;
        };

        // Parse weight text
        const parseWeightText = () => {
            const blocks = weightText.value.split(/\n\s*\n/);
            const matched = [];
            const unmatched = [];

            blocks.forEach(block => {
                const lines = block.trim().split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length >= 2) {
                    const typeInput = lines[0];
                    const value = lines[1];
                    const comment = lines.length > 2 ? lines.slice(2).join(' ') : '';
                    const trimmedComment = comment.trim();
                    const filteredComment = trimmedComment.split(/\s+/).filter(word => word.length >= 2).join(' ');

                    const matchedType = findMatchingType(typeInput);

                    if (matchedType) {
                        matched.push({
                            type: matchedType,
                            value: value,
                            comment: filteredComment
                        });
                    } else {
                        unmatched.push(block.trim());
                    }
                }
            });

            weightItems.value = [...weightItems.value, ...matched];
            unmatchedBlocks.value = unmatched;
            weightText.value = unmatched.join('\n\n');
        };

        // Clear weight items
        const clearWeightItems = () => {
            weightItems.value = [];
            unmatchedBlocks.value = [];
            weightText.value = '';
        };

        // Edit weight item - send back to textarea
        const editWeightItem = (index) => {
            const item = weightItems.value[index];
            const unit = weightUnits[item.type];
            const text = `${item.type}\n${item.value}\n${item.comment}`.trim();
            weightText.value = weightText.value ? weightText.value + '\n\n' + text : text;
            weightItems.value = weightItems.value.filter((_, i) => i !== index);
        };

        // Push weight items to API
        const pushWeightItems = async () => {
            try {
                const apiUrl = `https://n8n.floresbenavides.com/webhook/scaledata?date=${weightDate.value}`;
                const payload = weightItems.value.map(item => ({
                    type: item.type,
                    value: item.value,
                    comment: item.comment
                }));

                const headers = {
                    'Content-Type': 'application/json'
                };

                if (authToken.value) {
                    headers['Authorization'] = `Bearer ${authToken.value}`;
                }

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                alert('Datos enviados exitosamente');
                clearWeightItems();
            } catch (error) {
                console.error('Error al enviar datos:', error);
                alert('Error al enviar datos. Por favor, intenta nuevamente.');
            }
        };

        // Login
        const login = async () => {
            try {
                const response = await fetch('https://n8n.floresbenavides.com/webhook/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user: loginUsername.value,
                        password: loginPassword.value
                    })
                });

                if (response.status === 401) {
                    loginError.value = 'Usuario o contraseña incorrectos';
                    return;
                }

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                if (data.token) {
                    authToken.value = data.token;
                    localStorage.setItem('authToken', data.token);
                    showLoginModal.value = false;
                    loginError.value = '';
                    loginUsername.value = '';
                    loginPassword.value = '';
                    currentSection.value = 'weight';
                } else {
                    loginError.value = 'Error: No se recibió token';
                }
            } catch (error) {
                console.error('Error al iniciar sesión:', error);
                loginError.value = 'Error de conexión. Intenta nuevamente.';
            }
        };

        // Logout
        const logout = () => {
            authToken.value = '';
            localStorage.removeItem('authToken');
            currentSection.value = 'glucose';
        };

        // Zoom controls
        const getZoomWindowSize = () => {
            if (zoomLevel.value === 'all') {
                return fullDataRange.value.max - fullDataRange.value.min;
            }
            // Extract number from zoom level (e.g., "1h" -> 1, "4h" -> 4)
            const hours = parseInt(zoomLevel.value);
            return hours * 60 * 60 * 1000;
        };

        const setZoomLevel = (level) => {
            zoomLevel.value = level;
            if (level === 'all') {
                zoomWindowStart.value = 0;
            } else {
                const hours = parseInt(level);
                const windowSize = hours * 60 * 60 * 1000;
                const dataRange = fullDataRange.value.max - fullDataRange.value.min;
                
                // If data range is smaller than window size, show all data
                if (dataRange <= windowSize) {
                    zoomWindowStart.value = fullDataRange.value.min;
                } else {
                    // Start from the end of the data and go back windowSize
                    zoomWindowStart.value = fullDataRange.value.max - windowSize;
                }
            }
            updateChart();
        };

        const moveZoomWindow = (direction) => {
            // Don't allow movement if zoom is set to 'all' or no data loaded
            if (zoomLevel.value === 'all') {
                return;
            }
            
            // Check if data has been loaded (range should be > 0)
            const dataRange = fullDataRange.value.max - fullDataRange.value.min;
            if (dataRange <= 0) {
                return;
            }
            
            const windowSize = getZoomWindowSize();
            const step = windowSize * 0.5;
            
            if (direction === 'left') {
                zoomWindowStart.value = Math.max(fullDataRange.value.min, zoomWindowStart.value - step);
            } else {
                zoomWindowStart.value = Math.min(fullDataRange.value.max - windowSize, zoomWindowStart.value + step);
            }
            updateChart();
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

            // Group glucose readings that are within 2 minutes of each other
            const groupGlucoseReadings = (readings, groupThresholdMs = timeThreshold.value * 60 * 1000) => {
                if (readings.length === 0) return [];

                const grouped = [];
                let currentGroup = [readings[0]];

                for (let i = 1; i < readings.length; i++) {
                    const firstReading = currentGroup[0];
                    const currentReading = readings[i];
                    const timeDiff = currentReading.timestamp.getTime() - firstReading.timestamp.getTime();

                    if (timeDiff <= groupThresholdMs) {
                        currentGroup.push(currentReading);
                    } else {
                        const avgValue = currentGroup.reduce((sum, r) => sum + r.value, 0) / currentGroup.length;
                        grouped.push({
                            value: avgValue.toFixed(0),
                            timestamp: currentGroup[0].timestamp
                        });
                        currentGroup = [currentReading];
                    }
                }

                if (currentGroup.length > 0) {
                    const avgValue = currentGroup.reduce((sum, r) => sum + r.value, 0) / currentGroup.length;
                    grouped.push({
                        value: avgValue.toFixed(0),
                        timestamp: currentGroup[0].timestamp
                    });
                }

                return grouped;
            };

            const groupedGlucoseData = groupGlucoseReadings(glucoseData);

            if (groupedGlucoseData.length === 0) {
                if (chartInstance.value) {
                    chartInstance.value.destroy();
                    chartInstance.value = null;
                }
                return;
            }

            // Prepare labels from glucose readings - use timestamps
            const labels = groupedGlucoseData.map(r => r.timestamp);
            const glucoseValues = groupedGlucoseData.map(r => r.value);

            // Create x,y pairs for glucose line
            const glucoseDataPoints = groupedGlucoseData.map(r => ({
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
            const allTimestamps = [...groupedGlucoseData.map(r => r.timestamp.getTime()), ...otherEvents.map(e => e.timestamp.getTime())];
            const dataMinTimestamp = Math.min(...allTimestamps);
            const dataMaxTimestamp = Math.max(...allTimestamps);
            
            // Store full data range for zoom
            fullDataRange.value = { min: dataMinTimestamp, max: dataMaxTimestamp };
            
            // Calculate zoom window based on zoom level
            const windowSize = getZoomWindowSize();
            let windowStart, windowEnd;
            
            if (zoomLevel.value === 'all') {
                windowStart = dataMinTimestamp;
                windowEnd = dataMaxTimestamp;
            } else {
                // Use zoomWindowStart, but ensure it's within valid range
                windowStart = zoomWindowStart.value;
                
                // If zoomWindowStart is 0 (initial value), start from end of data
                if (windowStart === 0 || windowStart < dataMinTimestamp) {
                    windowStart = Math.max(dataMinTimestamp, dataMaxTimestamp - windowSize);
                }
                
                windowEnd = windowStart + windowSize;
            }
            
            // Ensure window stays within data bounds
            if (windowEnd > dataMaxTimestamp) {
                windowEnd = dataMaxTimestamp;
                windowStart = windowEnd - windowSize;
            }
            if (windowStart < dataMinTimestamp) {
                windowStart = dataMinTimestamp;
                windowEnd = dataMaxTimestamp;
            }
            
            // Add some padding (2 minutes on each side)
            const padding = 2 * 60 * 1000; // 2 minutes in milliseconds
            const minTimestamp = windowStart - padding;
            const maxTimestamp = windowEnd + padding;

            // Filter glucose data points to only show data within zoom window
            const filteredGlucoseDataPoints = glucoseDataPoints.filter(point => 
                point.x >= windowStart && point.x <= windowEnd
            );

            // If no data in zoom window, show all data
            const displayDataPoints = filteredGlucoseDataPoints.length > 0 ? filteredGlucoseDataPoints : glucoseDataPoints;

            // Calculate Y-axis max - max glucose value within zoom window or 200, whichever is greater
            const visibleGlucoseValues = displayDataPoints.map(p => p.y);
            const maxY = visibleGlucoseValues.length > 0 ? Math.max(Math.max(...visibleGlucoseValues), 200) : 200;

            // Create scatter dataset for other events - use actual timestamp for x position
            // Only include events within zoom window
            const scatterData = otherEvents
                .filter(event => {
                    const eventTimestamp = event.timestamp.getTime();
                    return eventTimestamp >= windowStart && eventTimestamp <= windowEnd;
                })
                .map(event => {
                    // Find closest glucose reading by timestamp
                    const eventTimestamp = event.timestamp.getTime();
                    let closestGlucose = null;
                    let minDiff = Infinity;

                    groupedGlucoseData.forEach(glucose => {
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
                    data: displayDataPoints,
                    borderColor: '#2ac3de',
                    backgroundColor: 'rgba(42, 195, 222, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.2,
                    order: 1,
                    pointBackgroundColor: '#2ac3de',
                    pointBorderColor: 'transparent',
                    pointRadius: 5,
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

        const currentGlucose = computed(() => {
            const readings = glucoseReadings.value;
            if (readings.length === 0) return '-';
            return readings[readings.length - 1].value.toFixed(0);
        });

        const currentTrend = computed(() => {
            const readings = glucoseReadings.value;
            if (readings.length === 0) return null;
            
            // Get the latest reading
            const latestReading = readings[readings.length - 1];
            
            // Need at least 2 readings to calculate trend
            if (readings.length < 2) return null;
            
            // Find the oldest reading to pair with the latest for trend calculation
            const oldestReading = readings[0];
            
            // Calculate time difference in minutes
            const timeDiffMs = latestReading.timestamp.getTime() - oldestReading.timestamp.getTime();
            const timeDiffMinutes = timeDiffMs / (60 * 1000);
            
            // Calculate glucose change
            const glucoseChange = latestReading.value - oldestReading.value;
            
            // Calculate rate of change per minute
            const ratePerMinute = glucoseChange / timeDiffMinutes;
            
            // Determine trend level (1-5) based on mg/dL per minute
            let trend;
            if (ratePerMinute > 2) {
                trend = 1; // ↑ Rising quickly (more than 2 mg/dL per minute)
            } else if (ratePerMinute > 1) {
                trend = 2; // ↗ Rising (between 1 and 2 mg/dL per minute)
            } else if (ratePerMinute >= -1) {
                trend = 3; // → Changing slowly (less than 1 mg/dL per minute)
            } else if (ratePerMinute >= -2) {
                trend = 4; // ↘ Falling (between 1 and 2 mg/dL per minute)
            } else {
                trend = 5; // ↓ Falling quickly (more than 2 mg/dL per minute)
            }
            
            const trendArrows = {
                1: '↑',
                2: '↗',
                3: '→',
                4: '↘',
                5: '↓'
            };
            return trendArrows[trend] || null;
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

        // Group body stats by type and ensure 7 days
        const groupedBodyStats = computed(() => {
            const groups = {};

            // Generate 7 dates from bodyStatsFromDate (using UTC since server epochs are timezone-aware)
            const dates = [];
            const startDate = new Date(bodyStatsFromDate.value + 'T00:00:00Z');
            for (let i = 0; i < 7; i++) {
                const date = new Date(startDate);
                date.setUTCDate(startDate.getUTCDate() + i);
                dates.push(date);
            }

            // First, group all items by type (use UTC for date key since epochs are timezone-aware)
            bodyStats.value.forEach(item => {
                const type = item.type;
                if (!groups[type]) {
                    groups[type] = {};
                }
                const itemDate = new Date(parseInt(item.epoch));
                const dateKey = itemDate.getUTCFullYear() + '-' +
                    String(itemDate.getUTCMonth() + 1).padStart(2, '0') + '-' +
                    String(itemDate.getUTCDate()).padStart(2, '0');
                groups[type][dateKey] = item;
            });

            // Then, for each type, create an array of 7 items (one per date)
            const result = {};
            Object.keys(groups).forEach(type => {
                const items = dates.map(date => {
                    const dateKey = date.getUTCFullYear() + '-' +
                        String(date.getUTCMonth() + 1).padStart(2, '0') + '-' +
                        String(date.getUTCDate()).padStart(2, '0');
                    const item = groups[type][dateKey];
                    return {
                        date: date,
                        value: item?.value || null,
                        comment: item?.comment || '',
                        hasData: !!item
                    };
                });
                result[type] = items;
            });

            return result;
        });

        // Get ordered body stats types
        const orderedBodyStatsTypes = computed(() => {
            const priorityOrder = ['Peso', 'BMI', 'Grasa', 'Músculo', 'Agua (%)', 'Metabolismo'];
            const allTypes = Object.keys(groupedBodyStats.value);

            // Sort by priority order first, then alphabetically
            return allTypes.sort((a, b) => {
                const indexA = priorityOrder.indexOf(a);
                const indexB = priorityOrder.indexOf(b);

                // If both in priority list, sort by priority
                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                }
                // If only a in priority list, a comes first
                if (indexA !== -1) {
                    return -1;
                }
                // If only b in priority list, b comes first
                if (indexB !== -1) {
                    return 1;
                }
                // Neither in priority list, sort alphabetically
                return a.localeCompare(b);
            });
        });

        // Watch for date changes
        watch(currentDate, () => {
            updateUrlDate();
            fetchEvents();
        });

        // Watch for threshold changes
        watch(timeThreshold, () => {
            updateChart();
        });

        // Watch for section changes
        watch(currentSection, (newSection) => {
            if (newSection === 'bodystats') {
                fetchBodyStats();
            }
        });

        // Watch for body stats date changes
        watch(bodyStatsFromDate, () => {
            if (currentSection.value === 'bodystats') {
                fetchBodyStats();
            }
        });

        // Lifecycle
        onMounted(() => {
            fetchEvents();
        });

        // Cleanup on unmount
        onUnmounted(() => {
            if (autoRefreshInterval.value) {
                clearInterval(autoRefreshInterval.value);
            }
        });

        // Switch between sections
        const setSection = (section) => {
            if (section === 'weight' && !authToken.value) {
                showLoginModal.value = true;
                return;
            }
            currentSection.value = section;
        };

        return {
            currentSection,
            setSection,
            weightText,
            weightItems,
            weightDate,
            weightUnits,
            unmatchedBlocks,
            parseWeightText,
            clearWeightItems,
            editWeightItem,
            pushWeightItems,
            authToken,
            loginUsername,
            loginPassword,
            loginError,
            showLoginModal,
            login,
            logout,
            bodyStats,
            bodyStatsFromDate,
            bodyStatsLoading,
            bodyStatsError,
            groupedBodyStats,
            orderedBodyStatsTypes,
            fetchBodyStats,
            events,
            loading,
            error,
            currentDate,
            selectedEvent,
            timeThreshold,
            thresholdDisplay,
            formatDateForDisplay,
            previousDay,
            nextDay,
            goToToday,
            setThreshold,
            reloadData,
            isAutoRefreshing,
            toggleAutoRefresh,
            zoomLevel,
            setZoomLevel,
            moveZoomWindow,
            getZoomWindowSize,
            glucoseReadings,
            otherEvents,
            maxGlucose,
            minGlucose,
            avgGlucose,
            currentGlucose,
            currentTrend,
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
            <aside class="sidebar">
                <div 
                    class="sidebar-item" 
                    :class="{ active: currentSection === 'glucose' }"
                    @click="setSection('glucose')"
                    title="Glucose"
                >
                    <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2">
                        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
                    </svg>
                </div>
                <div
                    class="sidebar-item"
                    :class="{ active: currentSection === 'bodystats' }"
                    @click="setSection('bodystats')"
                    title="Body Stats"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="5" r="3"/>
                        <line x1="12" y1="8" x2="12" y2="16"/>
                        <line x1="12" y1="10" x2="4" y2="10"/>
                        <line x1="12" y1="10" x2="20" y2="10"/>
                        <line x1="12" y1="16" x2="8" y2="21"/>
                        <line x1="12" y1="16" x2="16" y2="21"/>
                    </svg>
                </div>
                <div
                    class="sidebar-item"
                    :class="{ active: currentSection === 'weight' }"
                    @click="setSection('weight')"
                    title="Input Data"
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17,8 12,3 7,8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                </div>
            </aside>

            <div class="main-content">
            <header>
                <a href="/" class="header-link">
                    <img src="icon.png" alt="Fitness Tracker" class="header-icon">
                    Fitness Tracker
                </a>
                <button v-if="authToken" @click="logout" class="logout-btn" title="Cerrar sesión">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16,17 21,12 16,7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                </button>
            </header>

            <main>
                <section class="section" v-show="currentSection === 'glucose'">
                    <div class="section-header">
                        <h2 class="section-title">Glucose Tracker</h2>
                        <div class="header-controls">
                            <button class="reload-btn" @click="reloadData" title="Recargar datos">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M23 4v6h-6"></path>
                                    <path d="M1 20v-6h6"></path>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                </svg>
                            </button>
                            <button class="heart-btn" :class="{ 'beating': isAutoRefreshing }" @click="toggleAutoRefresh" title="Auto-recargar cada minuto">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Date Controls -->
                    <div class="date-controls">
                        <button class="date-btn date-nav-btn" @click="previousDay">←</button>
                        <span class="date-display">{{ formatDateForDisplay(currentDate) }}</span>
                        <button class="date-btn date-nav-btn" @click="nextDay">→</button>
                    </div>

                    <!-- Zoom and Threshold Controls -->
                    <div class="controls-row">
                        <div class="zoom-controls">
                            <div class="zoom-levels">
                                <button 
                                    v-for="level in ['4h', '12h', 'all']" 
                                    :key="level"
                                    class="zoom-btn"
                                    :class="{ active: zoomLevel === level }"
                                    @click="setZoomLevel(level)"
                                >
                                    {{ level === 'all' ? 'Todo' : level }}
                                </button>
                            </div>
                            <div class="zoom-navigation" v-if="zoomLevel !== 'all'">
                                <button class="zoom-nav-btn" @click="moveZoomWindow('left')">←</button>
                                <button class="zoom-nav-btn" @click="moveZoomWindow('right')">→</button>
                            </div>
                            <span class="controls-label">Zoom</span>
                        </div>
                        
                        <div class="controls-separator"></div>
                        
                        <div class="threshold-buttons">
                            <span class="controls-label">Detalle</span>
                            <button class="threshold-btn" @click="setThreshold(60)">-</button>
                            <button class="threshold-btn" @click="setThreshold(30)">N</button>
                            <button class="threshold-btn" @click="setThreshold(0)">+</button>
                        </div>
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
                                        <span class="stat-label">Actual</span>
                                        <span class="stat-value">{{ currentGlucose }} <span v-if="currentTrend" class="trend-arrow">{{ currentTrend }}</span></span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Promedio</span>
                                        <span class="stat-value">{{ avgGlucose }}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Máximo</span>
                                        <span class="stat-value">{{ maxGlucose }}</span>
                                    </div>
                                    <div class="stat-item">
                                        <span class="stat-label">Mínimo</span>
                                        <span class="stat-value">{{ minGlucose }}</span>
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

                <!-- Weight Section -->
                <section class="section" v-show="currentSection === 'weight'">
                    <div class="section-header">
                        <h2 class="section-title">Input Data</h2>
                    </div>

                    <div class="weight-input-container">
                        <h3 style="color: var(--accent-blue); margin-bottom: var(--spacing-md);">Agregar datos de peso</h3>
                        <p style="color: var(--text-secondary); margin-bottom: var(--spacing-sm); font-size: 0.9rem;">
                            Formato: Tipo (línea 1), Valor (línea 2), Comentario opcional (línea 3+). Separa cada elemento con una línea en blanco.
                        </p>
                        <textarea
                            v-model="weightText"
                            class="weight-textarea"
                            placeholder="Peso (Kg)&#10;102.3&#10;Obese"
                            rows="5"
                        ></textarea>
                        <div style="display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-sm);">
                            <button class="date-btn" @click="parseWeightText">Enviar</button>
                            <button class="date-btn date-btn-clear" @click="clearWeightItems">Limpiar</button>
                        </div>
                        <div v-if="unmatchedBlocks.length > 0" style="margin-top: var(--spacing-sm); color: var(--accent-yellow); font-size: 0.85rem;">
                            <p>{{ unmatchedBlocks.length }} elemento(s) no reconocido(s). Verifica los tipos y vuelve a enviar.</p>
                        </div>
                    </div>

                    <div v-if="weightItems.length > 0" class="weight-items-list" style="margin-top: var(--spacing-xl);">
                        <h3 style="color: var(--accent-blue); margin-bottom: var(--spacing-md);">Datos ingresados</h3>
                        <div
                            v-for="(item, index) in weightItems"
                            :key="index"
                            class="weight-item"
                            @click="editWeightItem(index)"
                            style="cursor: pointer;"
                            title="Click para editar"
                        >
                            <div class="weight-item-header">
                                <span class="weight-item-type">{{ item.type }}</span>
                                <span class="weight-item-value">{{ item.value }} {{ weightUnits[item.type] }}</span>
                            </div>
                            <div v-if="item.comment" class="weight-item-comment">{{ item.comment }}</div>
                        </div>
                        <div style="margin-top: var(--spacing-md); display: flex; gap: var(--spacing-sm); align-items: center;">
                            <input
                                type="date"
                                v-model="weightDate"
                                class="date-input"
                            />
                            <button class="date-btn date-btn-push" @click="pushWeightItems" style="background-color: var(--accent-green);">Push</button>
                        </div>
                    </div>
                </section>

                <!-- Body Stats Section -->
                <section class="section" v-show="currentSection === 'bodystats'">
                    <div class="section-header">
                        <h2 class="section-title">Body Stats</h2>
                    </div>

                    <div style="margin-bottom: var(--spacing-md);">
                        <label style="display: block; margin-bottom: var(--spacing-sm); color: var(--text-primary);">Desde (Fecha de inicio)</label>
                        <div style="display: flex; gap: var(--spacing-sm); align-items: center;">
                            <input
                                type="date"
                                v-model="bodyStatsFromDate"
                                class="date-input"
                            />
                        </div>
                    </div>

                    <div v-if="bodyStatsLoading" style="text-align: center; color: var(--text-secondary); padding: var(--spacing-xl);">
                        Cargando datos...
                    </div>

                    <div v-else-if="bodyStatsError" style="text-align: center; color: var(--accent-red); padding: var(--spacing-xl);">
                        {{ bodyStatsError }}
                    </div>

                    <div v-else-if="Object.keys(groupedBodyStats).length > 0">
                        <div
                            v-for="type in orderedBodyStatsTypes"
                            :key="type"
                            style="margin-bottom: var(--spacing-xl);"
                        >
                            <h3 style="color: var(--accent-cyan); margin-bottom: var(--spacing-md); font-size: 1.2rem;">
                                {{ type + (type !== 'Agua (%)' ? ' (' + weightUnits[type] + ')' : '') }}
                            </h3>
                            <div style="display: flex; gap: var(--spacing-sm); width: 100%;">
                                <div
                                    v-for="(item, index) in groupedBodyStats[type]"
                                    :key="index"
                                    class="stat-card"
                                    :class="{ 'stat-card-empty': !item.hasData }"
                                >
                                    <div class="stat-date">{{ ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][item.date.getUTCDay()] + ' ' + String(item.date.getUTCDate()).padStart(2, '0') + ' ' + ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][item.date.getUTCMonth()] }}</div>
                                    <div v-if="item.hasData" class="stat-value">{{ item.value }}</div>
                                    <div v-else class="stat-value stat-value-empty">-</div>
                                    <div v-if="item.hasData && item.comment" class="stat-comment">{{ item.comment }}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-else style="text-align: center; color: var(--text-secondary); padding: var(--spacing-xl);">
                        No hay datos disponibles para el período seleccionado.
                    </div>
                </section>
            </main>
            </div>

            <!-- Login Modal -->
            <div v-if="showLoginModal" class="modal-overlay">
                <div class="modal-content">
                    <h2 style="color: var(--accent-blue); margin-bottom: var(--spacing-md);">Iniciar Sesión</h2>
                    <div style="margin-bottom: var(--spacing-md);">
                        <label style="display: block; margin-bottom: var(--spacing-sm); color: var(--text-primary);">Usuario</label>
                        <input
                            v-model="loginUsername"
                            type="text"
                            class="login-input"
                            placeholder="Usuario"
                            @keyup.enter="login"
                        />
                    </div>
                    <div style="margin-bottom: var(--spacing-md);">
                        <label style="display: block; margin-bottom: var(--spacing-sm); color: var(--text-primary);">Contraseña</label>
                        <input
                            v-model="loginPassword"
                            type="password"
                            class="login-input"
                            placeholder="Contraseña"
                            @keyup.enter="login"
                        />
                    </div>
                    <div v-if="loginError" style="margin-bottom: var(--spacing-md); color: var(--accent-red); font-size: 0.9rem;">
                        {{ loginError }}
                    </div>
                    <div style="display: flex; gap: var(--spacing-sm);">
                        <button class="date-btn" @click="login">Iniciar Sesión</button>
                        <button class="date-btn date-btn-clear" @click="showLoginModal = false; loginError = '';">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `
}).mount('#app');
