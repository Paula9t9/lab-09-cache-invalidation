'use strict';

require('dotenv').config();
const express = require('express');
const app = express();

const cors = require('cors');
app.use(cors());

const superagent = require('superagent');
const pg = require('pg');

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Listening on port ${port}`));

//database setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();

//constructor functions
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.results[0].formatted_address;
  this.latitude = res.results[0].geometry.location.lat;
  this.longitude = res.results[0].geometry.location.lng;
}

function Weather(weatherRes, time) {
  this.forecast = weatherRes;
  this.time = new Date(time * 1000).toDateString();
}

function Event(eventRes) {
  this.link = eventRes.url;
  this.name = eventRes.name.text;
  this.event_date = new Date(eventRes.start.local).toDateString();
  this.summary = eventRes.summary;
}

function Movie(movieRes){
  this.title = movieRes.title;
  this.overview = movieRes.overview;
  this.average_votes = movieRes.vote_average;
  this.total_votes = movieRes.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w200' + movieRes.poster_path;
  this.popularity = movieRes.popularity;
  this.released_on = movieRes.release_date;
}

//Get location data from Google Maps API
app.get('/location', (request, response) => {
  try {
    const queryData = request.query.data;
    //check if query is already in database
    let sqlStatement = 'SELECT * FROM locations WHERE search_query = $1;';
    let value = [queryData];
    return client.query(sqlStatement, value)
      .then(data => {
        //if data in database
        if (data.rowCount > 0) {
          //use data from db and send result
          response.status(200).send(data.rows[0]);
        } else {
          //get new data from Google Maps
          let dataFile = `https://maps.googleapis.com/maps/api/geocode/json?address=${queryData}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
          superagent.get(dataFile).then((googleMapsApiResponse) => {
            const locationObject = new Location(
              queryData,
              googleMapsApiResponse.body
            );
            //Insert new data into db
            let insertStatement =
              'INSERT INTO locations (search_query, formatted_query, latitude, longitude) VALUES ( $1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id;';
            let insertValue = [
              locationObject.search_query,
              locationObject.formatted_query,
              locationObject.latitude,
              locationObject.longitude
            ];
            client.query(insertStatement, insertValue)
              .then(result => {
                //set the new id returned from database on our current object
                locationObject.id = result.rows[0].id;
                return locationObject;
              });
            response.status(200).send(locationObject);
          });
        }
      });
  } catch (error) {
    console.log(error);
    response.status(500).send('There was an error on our end sorry.');
  }
});

//listening for request for weather data
app.get('/weather', (request, response) => {
  try {
    //Pass relevant data to lookup function to decide how to fetch data
    //Then it will call either db or passed in function to retrieve data
    lookupFunction(request.query.data, 'weather', weatherApiFetcher)
      //Once data returns, send that data in our response
      .then ( weatherData => {
        response.status(200).send(weatherData);
      });
  } catch (error) {
    console.error(error);
    response.status(500).send('Sorry, something went wrong.');
  }
});

//listening for request for events data
app.get('/events', (request, response) => {
  try {
    //Pass relevant data to lookupFunction to decide how to fetch data
    //Then it will call db or provided function to retrieve data
    lookupFunction(request.query.data, 'events', eventApiFetcher)
      //Once data returns, send that data in our response
      .then( eventData => {
        return response.status(200).send(eventData);
      });
  } catch (error) {
    console.log(error);
    response.status(500).send('There was an error on our end, sorry.');
  }
});

app.get('/movies', (request, response) => {
  try {
    lookupFunction(request.query.data, 'movies', movieApiFetcher)
      .then( movieData => {
        return response.status(200).send(movieData);
      });
  } catch (error) {
    console.log(error);
    response.status(500).send('There was an error on our end, sorry.');
  }
});

//queries the given database to decide where to return data from
//calls the provided api fetcher function if new data is needed
function lookupFunction(locationData, table, apiFetcher) {
  console.log('Provided location id: ', locationData.id);
  //checks relevant table for existing data
  let sqlStatement = `SELECT * FROM ${table} WHERE location_id = $1;`;
  let values = [locationData.id];
  return client.query(sqlStatement, values).then(data => {
    //if data in database
    if (data.rowCount > 0) {
      //return that data
      return data.rows;
    } else {
      //Call api fetcher to get new data
      return apiFetcher(
        locationData
      );
    }
  });
}

//Fetches weather data if lookup function cannot find existing data in db
function weatherApiFetcher(locationData) {
  try {
    //url to be queried
    let apiQueryUrl = `https://api.darksky.net/forecast/${process.env.DARKSKY_KEY}/${locationData.latitude},${locationData.longitude}`;

    //return the data retrieved via superagent
    return superagent.get(apiQueryUrl).then((weatherApiResponse) => {
      //pass data through weather constructor and store in array
      let weatherForecastMap = weatherApiResponse.body.daily.data.map(element => {
        return new Weather(element.summary, element.time);
      });
      //store new data in the database
      weatherForecastMap.forEach(element => {
        console.log('location id to be inserted in weather: ', locationData.id);
        let insertStatement =
        'INSERT INTO weather (location_id, forecast, weather_time) VALUES ( $1, $2, $3);';
        let insertValue = [ locationData.id, element.forecast, element.time];
        client.query(insertStatement, insertValue);
      });
      //return the array of weather objects
      return weatherForecastMap;
    });
  } catch(error){
    console.log(error);
    response.status(500).send('There was an error on our end, sorry.');
  }
}

//fetches data from api if lookup function couldn't find data in the db
function eventApiFetcher(locationData){
  try {
    //url to be queried
    let apiQueryUrl = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${locationData.longitude}&location.latitude=${locationData.latitude}`;

    //return data retrieved via superagent
    return superagent
      .get(apiQueryUrl)
      //authorization header required by eventbrite
      .set({ Authorization: `Bearer ${process.env.EVENTBRITE_KEY}` })
      .then((eventBriteApiResponse) => {
        //Pass event data through constructor and store in array
        let eventMap = eventBriteApiResponse.body.events.map(
          element => { 
            return new Event(element);
          }
        );
        //Store the new data in the database
        eventMap.forEach(element => {
          let insertStatement =
          'INSERT INTO events (location_id, created_at, link, event_name, event_date, summary) VALUES ( $1, $2, $3, $4, $5, $6);';
          let insertValue = [locationData.id, Date.now(),element.link, element.name, element.event_date, element.summary];
          client.query(insertStatement, insertValue);
        });
        return eventMap;
      });
  } catch(error){
    console.log('Error: ', error);
    response.status(500).send('There was an error on our end, sorry.');
  }
}

function movieApiFetcher (locationData) {
  try{
    let apiQueryUrl = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&language=en-US&query=${locationData.search_query}&page=1&include_adult=false`;

    return superagent
      .get(apiQueryUrl)
      .then( (movieApiResponse) => {
        let movieMap = movieApiResponse.body.results.map( result => {
          return new Movie(result);
        });
        movieMap.forEach( movie => {
          let insertStatement = 'INSERT INTO movies (location_id, created_at,movie_title, overview, avg_votes, total_votes, image_url, popularity, release_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);';
          let insertValues = [locationData.id, Date.now(),movie.title, movie.overview, movie.average_votes, movie.total_votes, movie.image_url, movie.popularity, movie.release_date];
          client.query(insertStatement, insertValues);
        });
        return movieMap;
      });
  } catch(error){
    console.log('Error: ', error);
    response.status(500).send('There was an error on our end, sorry.');
  }

}

//TODO: implement handleError to handle caught errors for each route
function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong.');
}
