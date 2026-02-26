# Fitness Tracker - Agent Guide

## Project Overview

This is a single-page application (SPA) for tracking fitness data, including glucose readings, body composition, and related events (food, gym, medicine). The site is built with Vue.js 3 using CDN links - **no build process required**. The static files are served directly by nginx.

The app has three main sections:
- **Glucose Tracker**: View glucose readings with charts and event markers
- **Input Data**: Upload weight and body composition data (requires authentication)
- **Body Stats**: View historical body composition data by type

## Essential Commands

### Development
```bash
# Start local development server (Python 3)
python3 -m http.server 8000

# Or with Python 2
python -m SimpleHTTPServer 8000

# Or with Node.js
npx serve
```

The site will be available at `http://localhost:8000`

### Deployment
Simply deploy the static files (`index.html`, `styles.css`, `app.js`) to nginx or any static file server. No build step is required.

## Project Structure

```
freestyle/
├── index.html          # Main HTML entry point
├── styles.css          # Tokyo Night themed CSS with CSS variables
├── app.js             # Vue 3 application logic
├── README.md          # API documentation
├── request.md         # Original project requirements
└── .gitignore         # Git ignore rules
```

## Technology Stack

- **Vue.js 3** (via CDN, Composition API)
- **Chart.js** (via CDN) for glucose tracking graph
- **Chart.js Annotation Plugin** (via CDN) for sweet zone visualization
- **Vanilla CSS** with CSS variables for Tokyo Night theme
- **No build tools** - uses CDN links only

## Code Organization

### Vue Application Structure (`app.js`)
- Uses Vue 3 Composition API with `setup()` function
- Reactive state managed with `ref()` and `computed()`
- Lifecycle hooks: `onMounted()` for initialization, `watch()` for date changes
- Single-file template defined as a string within the component

### Data Flow
1. Component mounts → fetches events from API
2. User changes date → watcher triggers new API call
3. Data arrives → chart updates automatically
4. User clicks chart point → event details shown

### CSS Architecture (`styles.css`)
- **CSS Variables** defined in `:root` for Tokyo Night theme colors
- **Responsive Design**: Mobile-first with breakpoints at 768px and 480px
- **Component Classes**: `.section`, `.date-controls`, `.chart-container`, `.event-item`
- **Event Type Colors**: Each event type has distinct color coding

## Key Features

### Glucose Tracker
- Line chart showing glucose readings over time
- Sweet zone (60-180 mg/dL) highlighted with green background
- X-axis: Time of day (hours)
- Y-axis: Glucose level in mg/dL

### Event Markers
- Non-glucose events (food, gym, medicine) displayed as triangle markers on the chart
- Click markers to view event details
- Colors: Orange (food), Green (gym), Purple (medicine)

### Date Navigation
- Previous/Next day buttons
- "Today" button to return to current date
- Date displayed in Spanish locale format

### Event List
- Below the chart, displays all non-glucose events for the selected day
- Click any event to view details
- Color-coded by event type

### Input Data (Weight Tracker)
- Textarea for inputting weight and body composition data
- Multi-line format: Type (line 1), Value (line 2), Comment optional (line 3+)
- Separate each entry with blank line
- Parse button converts text to structured items
- Date picker to select date for data upload
- Push button sends data to API
- Click items to edit them
- Comments filter out words < 2 characters

### Body Stats
- Displays historical body composition data from API
- Requires "from" date parameter (shows data from that date + 7 days)
- Data grouped by type (Peso, Grasa, BMI, etc.)
- Unit displayed after type name (except "Agua (%)" which includes "%")
- Each type always shows exactly 7 stat cards (one per day)
- Cards without data show "-" and have reduced opacity
- Each card displays: date, value, and comment (if exists)
- Hover effect on cards for better UX

## API Integration

### Endpoint
```
GET https://n8n.floresbenavides.com/webhook/events?date=YYYY-MM-DD
```

### Response Format
```json
[
  {
    "type": "glucose_reading",
    "desc": "75",
    "timestamp": "2026-02-20T05:57:09.000Z"
  },
  {
    "type": "food",
    "desc": "Lunch description",
    "timestamp": "2026-02-20T12:00:00.000Z"
  }
]
```

### Event Types
- `glucose_reading`: Numeric glucose value in desc
- `food`: Text description in desc
- `gym`: Text description in desc
- `medicine`: Text description in desc

### Body Stats Endpoint
```
GET https://n8n.floresbenavides.com/webhook/bodyStats?from=YYYY-MM-DD
```

### Body Stats Response Format
```json
[
  {
    "type": "Peso",
    "value": "102.30",
    "comment": "Obese",
    "epoch": "1771977600000"
  },
  {
    "type": "Grasa",
    "value": "30.9",
    "comment": "Obese",
    "epoch": "1771977600000"
  }
]
```

### Body Stats Notes
- Returns data from `from` date for 7 days (1 week)
- Multiple entries per type with different epochs (timestamps)
- `epoch` is a millisecond timestamp
- Grouped by type in UI (Peso, Grasa, BMI, etc.)

### Login Endpoint
```
POST https://n8n.floresbenavides.com/webhook-test/login
Content-Type: application/json

{
  "user": "admin",
  "password": "admin"
}
```

### Login Response
```json
{
  "token": "your-auth-token"
}
```

### Login Notes
- Returns 401 for invalid credentials
- Token should be stored in localStorage
- Token required for input data access and push operations

### Scale Data Endpoint
```
POST https://n8n.floresbenavides.com/webhook-test/scaledata?date=YYYY-MM-DD
Authorization: Bearer <token>
Content-Type: application/json

[
  {
    "type": "Peso",
    "value": "102.3",
    "comment": "Obese"
  }
]
```

### Scale Data Notes
- Requires valid auth token in Authorization header
- Date parameter in query string for when the data applies
- Sends array of weight/body composition items
- Types must match accepted weight types

### Notes
- Timestamps are already localized (no offset needed)
- Date parameter is optional - defaults to current date if not provided
- No authentication required

## Naming Conventions

### Vue/JavaScript
- **Components**: Single component, no component files
- **State Variables**: CamelCase (`currentDate`, `selectedEvent`)
- **Functions**: CamelCase, descriptive names (`formatDateForApi`, `fetchEvents`)
- **Constants**: UPPER_SNAKE_CASE for API URLs (`apiUrl`)

### CSS
- **Classes**: kebab-case (`.date-controls`, `.event-item`, `.stat-card`, `.stat-card-empty`)
- **CSS Variables**: kebab-case with `--` prefix (`--bg-primary`, `--accent-blue`)
- **File Names**: lowercase with extensions (`styles.css`, `app.js`)

## Tokyo Night Theme Colors

```css
--bg-primary: #1a1b26       /* Main background */
--bg-secondary: #24283b     /* Section backgrounds */
--bg-tertiary: #414868      /* Cards, borders */
--text-primary: #c0caf5     /* Main text */
--text-secondary: #a9b1d6   /* Secondary text */
--accent-blue: #7aa2f7      /* Primary accent */
--accent-cyan: #2ac3de      /* Links, headers */
--accent-magenta: #bb9af7   /* Medicine events */
--accent-green: #9ece6a     /* Gym events */
--accent-orange: #ff9e64    /* Food events */
--accent-red: #f7768e       /* Errors */
--accent-yellow: #e0af68    /* Warnings */
```

## Responsive Breakpoints

- **Desktop**: > 768px (default styles)
- **Tablet**: ≤ 768px (reduced padding, smaller fonts)
- **Mobile**: ≤ 480px (minimal spacing, compact layout)

## Important Gotchas

### No Build Process
- This project uses CDN links for Vue.js and Chart.js
- Do not add webpack, vite, or any build tools
- Direct file edits only - no compilation step
- All dependencies loaded from public CDNs

### Chart.js Plugin Loading
- Annotation plugin must be loaded in HTML before app.js
- Plugin is loaded via CDN, not npm
- Order matters: Vue → Chart.js → Annotation Plugin → app.js

### Date Handling
- Timestamps from API are already in local timezone
- Use `formatDateForApi()` for API queries (YYYY-MM-DD format)
- Use `formatDateForDisplay()` for UI (Spanish locale)
- Date objects must be cloned before mutation to avoid reactivity issues

### Event Click Handling
- Chart click events work via Chart.js onClick callback
- Scatter dataset points (triangles) are clickable
- Clicking shows event detail, not glucose reading detail

### CSS Variable Access
- CSS variables defined in `:root` are global
- Use `var(--variable-name)` syntax in CSS
- Do not use inline styles with hardcoded colors

## Testing

### Manual Testing
1. Start local server: `python3 -m http.server 8000`
2. Open browser to `http://localhost:8000`
3. Verify:
   - Chart loads with glucose data
   - Sweet zone (60-180) is visible with green background
   - Date navigation works (previous/next/today)
   - Click chart points to see event details
   - Event list displays below chart
   - Responsive design on different screen sizes

### Common Issues
- **Chart not rendering**: Check browser console for errors, verify CDN links are accessible
- **Sweet zone not visible**: Ensure annotation plugin is loaded before app.js
- **Events not displaying**: Check API response format, verify data has expected structure

## Deployment

### Nginx Configuration (Example)
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /path/to/freestyle;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Simply copy these files to your nginx document root:
- `index.html`
- `styles.css`
- `app.js`

No additional configuration needed - the site is self-contained.

## Adding New Features

When adding new features:
1. **Keep it simple**: No build tools, use vanilla JS/Vue from CDN
2. **Follow existing patterns**: Use same naming conventions and structure
3. **Maintain responsiveness**: Test on mobile, tablet, desktop
4. **Use CSS variables**: Don't hardcode colors, use Tokyo Night palette
5. **Test API integration**: Ensure new API calls match existing format

## Related Files

- `README.md` - API documentation and endpoint details
- `request.md` - Original project requirements (in Spanish)
- `index.html` - Main HTML with CDN links
- `styles.css` - Tokyo Night themed CSS
- `app.js` - Vue 3 application with Chart.js integration
