import type { TelegramApi } from './api.js'
import type { BotConfig } from './config.js'
import { FileIdCache } from './file-ids.js'
import { StillPhotos } from './photos.js'
import { WeatherPlaces } from './weather-places.js'
import { PlaceWeatherRenderer } from './weather.js'

export function createPlaceWeather(config: BotConfig, api: TelegramApi, botId: number) {
  return {
    places: new WeatherPlaces(config.origin),
    renderer: new PlaceWeatherRenderer(config.origin, config.cacheDirectory),
    photos: new StillPhotos(api, new FileIdCache(`bot:${botId}`)),
  }
}

export type PlaceWeather = ReturnType<typeof createPlaceWeather>
