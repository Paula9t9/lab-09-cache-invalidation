DROP TABLE IF EXISTS weather, yelp, movies, trails, locations;


CREATE TABLE IF NOT EXISTS locations (
  id  SERIAL PRIMARY KEY,
  search_query VARCHAR(255),
  formatted_query VARCHAR(255),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7)
);

CREATE TABLE IF NOT EXISTS weather(
  id  SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES location(id),
  time_stamp BIGINT,
  forecast VARCHAR(255),
  weather_time VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS events(
  id  SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES location(id),
  time_stamp BIGINT,
  link VARCHAR(255),
  event_name VARCHAR(255),
  event_date CHAR(15),
  summary VARCHAR(1000)
);

CREATE TABLE IF NOT EXISTS yelp(
  id  SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES location(id),
  time_stamp BIGINT,
  yelp_name VARCHAR(255),
  image_url VARCHAR(255),
  price CHAR(15),
  rating NUMERIC,
  page_url VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS movies(
  id  SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES location(id),
  time_stamp BIGINT,
  movie_title VARCHAR(255),
  overview VARCHAR(1000)
  avg_votes NUMERIC,
  total_votes NUMERIC,
  image_url VARCHAR(255),
  popularity NUMERIC,
  release_date DATE
);

CREATE TABLE IF NOT EXISTS trails(
  id  SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES location(id),
  time_stamp BIGINT,
  trail_name VARCHAR(255),
  formatted_location VARCHAR(255),
  trail_length NUMERIC,
  stars NUMERIC,
  star_votes NUMERIC,
  summary VARCHAR(1000),
  trail_url VARCHAR(255),
  conditions VARCHAR(1000),
  condition_date DATE, 
  condition_time TIME
);