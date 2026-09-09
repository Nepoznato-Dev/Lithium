//! Weather — WMO code descriptions, emoji, report generation.
//! Ported from coreNative.js lines 931-1009.

use serde::Deserialize;

fn weather_desc(code: i32) -> &'static str {
    match code {
        0 => "clear sky", 1 => "mainly clear", 2 => "partly cloudy", 3 => "overcast",
        45 => "fog", 48 => "depositing rime fog", 51 => "light drizzle", 53 => "moderate drizzle",
        55 => "dense drizzle", 61 => "slight rain", 63 => "moderate rain", 65 => "heavy rain",
        71 => "slight snow", 73 => "moderate snow", 75 => "heavy snow", 77 => "snow grains",
        80 => "slight rain showers", 81 => "moderate rain showers", 82 => "violent rain showers",
        85 => "slight snow showers", 86 => "heavy snow showers",
        95 => "thunderstorm", 96 => "thunderstorm with slight hail", 99 => "thunderstorm with heavy hail",
        _ => "changing conditions",
    }
}

pub fn description(code: i32) -> String { weather_desc(code).to_string() }

pub fn emoji(code: i32, is_day: bool) -> &'static str {
    match code {
        0 | 1 => if is_day { "☀️" } else { "🌙" },
        2 => if is_day { "🌤️" } else { "☁️" },
        3 => "☁️",
        45 | 48 => "🌫️",
        51..=57 => "🌦️",
        61..=67 => "🌧️",
        71..=77 => "🌨️",
        80..=82 => "🌧️",
        85 | 86 => "❄️",
        95..=99 => "⛈️",
        _ => "🌥️",
    }
}

fn compass(deg: f64) -> &'static str {
    let dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    dirs[((deg / 22.5).round() as usize) % 16]
}

fn uv_label(uv: f64) -> &'static str {
    if uv < 3.0 { "low" } else if uv < 6.0 { "moderate" } else if uv < 8.0 { "high" } else if uv < 11.0 { "very high" } else { "extreme" }
}

#[derive(Deserialize)]
pub struct WeatherData {
    #[serde(default)]
    pub location_label: Option<String>,
    #[serde(default)]
    pub latitude: f64,
    #[serde(default)]
    pub longitude: f64,
    #[serde(default)]
    pub timezone: Option<String>,
    #[serde(default)]
    pub current: Option<serde_json::Value>,
    #[serde(default)]
    pub daily: Option<serde_json::Value>,
    #[serde(default)]
    pub current_units: Option<serde_json::Value>,
}

pub fn report(data: &WeatherData) -> String {
    let loc = data.location_label.as_deref().unwrap_or("your device location");
    let cur = data.current.as_ref();
    let daily = data.daily.as_ref();
    let units = data.current_units.as_ref();
    let w_code = cur.and_then(|c| c.get("weather_code")).and_then(|v| v.as_i64()).unwrap_or(0) as i32;
    let is_day = cur.and_then(|c| c.get("is_day")).and_then(|v| v.as_i64()).unwrap_or(0) != 0;
    let temp = cur.and_then(|c| c.get("temperature_2m")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let apparent = cur.and_then(|c| c.get("apparent_temperature")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let humidity = cur.and_then(|c| c.get("relative_humidity_2m")).and_then(|v| v.as_i64()).unwrap_or(0);
    let wind_speed = cur.and_then(|c| c.get("wind_speed_10m")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let wind_dir = cur.and_then(|c| c.get("wind_direction_10m")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let pressure = cur.and_then(|c| c.get("pressure_msl")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let cloud_cover = cur.and_then(|c| c.get("cloud_cover")).and_then(|v| v.as_i64()).unwrap_or(0);
    let precip = cur.and_then(|c| c.get("precipitation")).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let temp_unit = units.and_then(|u| u.get("temperature_2m")).and_then(|v| v.as_str()).unwrap_or("°C");
    let wind_unit = units.and_then(|u| u.get("wind_speed_10m")).and_then(|v| v.as_str()).unwrap_or("km/h");
    let precip_unit = units.and_then(|u| u.get("precipitation")).and_then(|v| v.as_str()).unwrap_or("mm");
    let temp_max = daily.and_then(|d| d.get("temperature_2m_max")).and_then(|v| v.get(0)).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let temp_min = daily.and_then(|d| d.get("temperature_2m_min")).and_then(|v| v.get(0)).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let rain_chance = daily.and_then(|d| d.get("precipitation_probability_max")).and_then(|v| v.get(0)).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let uv_index = daily.and_then(|d| d.get("uv_index_max")).and_then(|v| v.get(0)).and_then(|v| v.as_f64()).unwrap_or(0.0);
    let sunrise = daily.and_then(|d| d.get("sunrise")).and_then(|v| v.get(0)).and_then(|v| v.as_str()).unwrap_or("").split('T').nth(1).unwrap_or("").chars().take(5).collect::<String>();
    let sunset = daily.and_then(|d| d.get("sunset")).and_then(|v| v.get(0)).and_then(|v| v.as_str()).unwrap_or("").split('T').nth(1).unwrap_or("").chars().take(5).collect::<String>();
    let desc = weather_desc(w_code);
    let day_night = if is_day { "day" } else { "night" };
    let mut parts = vec![format!("{} right now", desc)];
    if humidity >= 75 { parts.push(format!("humid at {}%", humidity)); }
    else if humidity <= 30 { parts.push(format!("dry air at {}%", humidity)); }
    if wind_speed >= 20.0 { parts.push(format!("windy ({} km/h)", wind_speed as i32)); }
    if uv_index >= 6.0 { parts.push("strong UV today — shade or sunscreen advised".to_string()); }
    if rain_chance >= 50.0 { parts.push("rain likely later".to_string()); }
    let summary = parts.join(", ") + ".";
    format!(
        "# Device & Environment Report\n\n**Generated:** now · **Location:** {} ({:.0}°, {:.0}°) · **Timezone:** {}\n\n## Current conditions\n- **Weather:** {} ({})\n- **Temperature:** {}{}{} (feels like {}{}{})\n- **Humidity:** {}%\n- **Wind:** {} {} from {} ({:.0}°)\n- **Pressure:** {} hPa\n- **Cloud cover:** {}%\n- **Precipitation:** {} {}\n\n## Today\n- **High / Low:** {}° / {}°\n- **Rain chance:** {}%\n- **UV index:** {} ({})\n- **Sunrise / Sunset:** {} / {}\n\n> Summary: {}",
        loc, data.latitude, data.longitude, data.timezone.as_deref().unwrap_or("local"),
        desc, day_night, temp as i32, temp_unit, "", apparent as i32, temp_unit, "",
        humidity, wind_speed as i32, wind_unit, compass(wind_dir), wind_dir,
        pressure as i32, cloud_cover, precip, precip_unit,
        temp_max as i32, temp_min as i32,
        if rain_chance > 0.0 { format!("{}", rain_chance as i32) } else { "—".to_string() },
        if uv_index > 0.0 { format!("{}", uv_index as i32) } else { "—".to_string() },
        uv_label(uv_index), sunrise, sunset, summary
    )
}

#[derive(Deserialize)]
pub struct SummaryParams {
    #[serde(default)]
    pub weather_code: Option<i32>,
    #[serde(default)]
    pub humidity: Option<f64>,
    #[serde(default)]
    pub wind_speed: Option<f64>,
    #[serde(default)]
    pub uv_index: Option<f64>,
    #[serde(default)]
    pub rain_chance: Option<f64>,
}

pub fn summary_line(p: &SummaryParams) -> String {
    let mut parts = vec![format!("{} right now", weather_desc(p.weather_code.unwrap_or(-1)))];
    if let Some(h) = p.humidity { if h >= 75.0 { parts.push(format!("humid at {}%", h as i32)); } else if h <= 30.0 { parts.push(format!("dry air at {}%", h as i32)); } }
    if let Some(w) = p.wind_speed { if w >= 20.0 { parts.push(format!("windy ({} km/h)", w as i32)); } }
    if let Some(u) = p.uv_index { if u >= 6.0 { parts.push("strong UV today — shade or sunscreen advised".to_string()); } }
    if let Some(r) = p.rain_chance { if r >= 50.0 { parts.push("rain likely later".to_string()); } }
    parts.join(", ") + "."
}
