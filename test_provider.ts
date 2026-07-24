import { scrapeMovieBox } from './src/providers/moviebox-provider';

async function test() {
  const media = {
    title: "Love Island", // Note: often TMDB title is just "Love Island" or "Love Island USA" depending on region/alias, let's see. Wait, TMDB title is "Love Island USA"
    releaseYear: 2019,
    tmdbId: "90521",
    type: "show",
    episode: {
      number: 18,
      title: "Episode 18",
      tmdbId: "111111", 
      air_date: "2026-07-04"
    },
    season: {
      number: 8,
      title: "Season 8",
      tmdbId: "222222"
    }
  };

  try {
    const result = await scrapeMovieBox({ media, fetcher: globalThis.fetch });
    console.log("Scrape successful!");
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("Scrape failed:", err);
  }
}

test();
