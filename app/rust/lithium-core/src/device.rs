//! Device context — weather code descriptions, report generation, unit conversions.

use crate::{get, Parser, Value};

/// WMO weather code → description.
pub fn weather_description(code: i32) -> &'static str {
    match code {
        0 => "clear sky",
        1 => "mainly clear",
        2 => "partly cloudy",
        3 => "overcast",
        45 => "fog",
        48 => "depositing rime fog",
        51 => "light drizzle",
        53 => "moderate drizzle",
        55 => "dense drizzle",
        61 => "slight rain",
        63 => "moderate rain",
        65 => "heavy rain",
        71 => "slight snow",
        73 => "moderate snow",
        75 => "heavy snow",
        77 => "snow grains",
        80 => "slight rain showers",
        81 => "moderate rain showers",
        82 => "violent rain showers",
        85 => "slight snow showers",
        86 => "heavy snow showers",
        95 => "thunderstorm",
        96 => "thunderstorm with slight hail",
        99 => "thunderstorm with heavy hail",
        _ => "changing conditions",
    }
}

/// WMO code → emoji, with day/night variant.
/// Input: `{"code": 2, "isDay": true}` → Output: `"🌤️"`
pub fn weather_emoji(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let code = get(&obj, "code")
        .and_then(|v| match v { Value::Num(n) => Some(*n as i32), _ => None })
        .unwrap_or(-1);
    let is_day = get(&obj, "isDay")
        .map(|v| matches!(v, Value::Bool(true)))
        .unwrap_or(true);

    let emoji = weather_emoji_str(code, is_day);
    Some(format!("\"{}\"", emoji))
}

pub fn weather_emoji_str(code: i32, is_day: bool) -> &'static str {
    match code {
        0 | 1 => if is_day { "☀️" } else { "🌙" },
        2 => if is_day { "🌤️" } else { "☁️" },
        3 => "☁️",
        45 | 48 => "🌫️",
        51..=57 => "🌦️",
        61..=67 => "🌧️",
        71..=77 => "🌨️",
        80..=82 => "🌧️",
        85..=86 => "❄️",
        95..=99 => "⛈️",
        _ => "🌥️",
    }
}

/// Compass direction from degrees.
fn compass(degrees: f64) -> &'static str {
    let dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    let idx = ((degrees / 22.5).round() as usize) % 16;
    dirs[idx]
}

/// UV index → label.
fn uv_label(uv: f64) -> &'static str {
    if uv < 3.0 { "low" }
    else if uv < 6.0 { "moderate" }
    else if uv < 8.0 { "high" }
    else if uv < 11.0 { "very high" }
    else { "extreme" }
}

/// Extract time portion from ISO datetime string.
fn time_only(iso: &str) -> String {
    iso.split('T').nth(1).map(|t| &t[..5.min(t.len())]).unwrap_or(iso).to_string()
}

/// Build weather report markdown.
/// Input: JSON object matching the open-meteo response structure + `locationLabel`.
/// Output: markdown string.
pub fn build_weather_report(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let location_label = get(&obj, "locationLabel")
        .and_then(|v| match v { Value::Str(s) => Some(s.as_str()), _ => None })
        .unwrap_or("your device location");
    let latitude = get_num(&obj, "latitude");
    let longitude = get_num(&obj, "longitude");
    let timezone = get_str(&obj, "timezone").unwrap_or_else(|| "local".to_string());

    // Extract current conditions
    let current = get_obj(&obj, "current");
    let daily = get_obj(&obj, "daily");
    let units = get_obj(&obj, "current_units");

    let weather_code = get_num(&current, "weather_code") as i32;
    let is_day = get_num(&current, "is_day") != 0.0;
    let temp = get_num(&current, "temperature_2m");
    let apparent = get_num(&current, "apparent_temperature");
    let humidity = get_num(&current, "relative_humidity_2m");
    let wind_speed = get_num(&current, "wind_speed_10m");
    let wind_dir = get_num(&current, "wind_direction_10m");
    let pressure = get_num(&current, "pressure_msl");
    let cloud_cover = get_num(&current, "cloud_cover");
    let precipitation = get_num(&current, "precipitation");

    let temp_unit = get_str(&units, "temperature_2m").unwrap_or_else(|| "°C".to_string());
    let wind_unit = get_str(&units, "wind_speed_10m").unwrap_or_else(|| "km/h".to_string());
    let precip_unit = get_str(&units, "precipitation").unwrap_or_else(|| "mm".to_string());

    // Daily values (arrays — take first element)
    let temp_max = get_arr_num(&daily, "temperature_2m_max", 0);
    let temp_min = get_arr_num(&daily, "temperature_2m_min", 0);
    let rain_chance = get_arr_num(&daily, "precipitation_probability_max", 0);
    let uv_index = get_arr_num(&daily, "uv_index_max", 0);
    let sunrise = get_arr_str(&daily, "sunrise", 0);
    let sunset = get_arr_str(&daily, "sunset", 0);

    let weather_desc = weather_description(weather_code);
    let day_night = if is_day { "day" } else { "night" };

    let report = format!(
        "# Device & Environment Report\n\n\
         **Generated:** now · **Location:** {} ({}°, {}°) · **Timezone:** {}\n\n\
         ## Current conditions\n\
         - **Weather:** {} ({}{})\n\
         - **Temperature:** {}{} (feels like {}{})\n\
         - **Humidity:** {}%\n\
         - **Wind:** {} {} from {} ({}°)\n\
         - **Pressure:** {} hPa\n\
         - **Cloud cover:** {}%\n\
         - **Precipitation:** {} {}\n\n\
         ## Today\n\
         - **High / Low:** {}° / {}°\n\
         - **Rain chance:** {}%\n\
         - **UV index:** {} ({})\n\
         - **Sunrise / Sunset:** {} / {}\n\n\
         > Summary: {}",
        location_label, latitude, longitude, timezone,
        weather_desc, day_night, "",
        temp, temp_unit, apparent, temp_unit,
        humidity as i32,
        wind_speed, wind_unit, compass(wind_dir), wind_dir as i32,
        pressure.round() as i32,
        cloud_cover as i32,
        precipitation, precip_unit,
        temp_max as i32, temp_min as i32,
        if rain_chance > 0.0 { format!("{}", rain_chance as i32) } else { "—".to_string() },
        if uv_index > 0.0 { format!("{}", uv_index as i32) } else { "—".to_string() },
        uv_label(uv_index),
        time_only(&sunrise), time_only(&sunset),
        summary_line(weather_code, humidity, wind_speed, uv_index, rain_chance),
    );

    Some(format!("\"{}\"", crate::json_escape(&report)))
}

/// Build summary line for weather report.
fn summary_line(weather_code: i32, humidity: f64, wind_speed: f64, uv_index: f64, rain_chance: f64) -> String {
    let mut parts = Vec::new();
    parts.push(format!("{} right now", weather_description(weather_code)));
    if humidity >= 75.0 {
        parts.push(format!("humid at {}%", humidity as i32));
    } else if humidity <= 30.0 {
        parts.push(format!("dry air at {}%", humidity as i32));
    }
    if wind_speed >= 20.0 {
        parts.push(format!("windy ({} km/h)", wind_speed as i32));
    }
    if uv_index >= 6.0 {
        parts.push("strong UV today — shade or sunscreen advised".to_string());
    }
    if rain_chance >= 50.0 {
        parts.push("rain likely later".to_string());
    }
    format!("{}.", parts.join(", "))
}

/// Summary line as a WASM-callable function.
/// Input: `{"weatherCode": 2, "humidity": 65, "windSpeed": 15, "uvIndex": 5, "rainChance": 30}`
pub fn summary_line_fn(input: &[u8]) -> Option<String> {
    let root = Parser::new(input).value()?;
    let Value::Obj(obj) = root else { return None };

    let code = get_num(&obj, "weatherCode") as i32;
    let humidity = get_num(&obj, "humidity");
    let wind_speed = get_num(&obj, "windSpeed");
    let uv_index = get_num(&obj, "uvIndex");
    let rain_chance = get_num(&obj, "rainChance");

    let result = summary_line(code, humidity, wind_speed, uv_index, rain_chance);
    Some(format!("\"{}\"", crate::json_escape(&result)))
}

// Helper functions
fn get_num(obj: &[(String, Value)], key: &str) -> f64 {
    get(obj, key)
        .and_then(|v| match v { Value::Num(n) => Some(*n), _ => None })
        .unwrap_or(0.0)
}

fn get_str(obj: &[(String, Value)], key: &str) -> Option<String> {
    get(obj, key)
        .and_then(|v| match v { Value::Str(s) => Some(s.clone()), _ => None })
}

fn get_obj(obj: &[(String, Value)], key: &str) -> Vec<(String, Value)> {
    get(obj, key)
        .and_then(|v| match v { Value::Obj(o) => Some(o.clone()), _ => None })
        .unwrap_or_default()
}

fn get_arr_num(obj: &[(String, Value)], key: &str, index: usize) -> f64 {
    get(obj, key)
        .and_then(|v| match v {
            Value::Arr(arr) => arr.get(index).and_then(|v| match v {
                Value::Num(n) => Some(*n),
                _ => None,
            }),
            _ => None,
        })
        .unwrap_or(0.0)
}

fn get_arr_str(obj: &[(String, Value)], key: &str, index: usize) -> String {
    get(obj, key)
        .and_then(|v| match v {
            Value::Arr(arr) => arr.get(index).and_then(|v| match v {
                Value::Str(s) => Some(s.clone()),
                _ => None,
            }),
            _ => None,
        })
        .unwrap_or_default()
}
