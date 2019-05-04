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

//construction function
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

app.get('/location', (request, response) => {
  try {
    const queryData = request.query.data;
    //check if query in database
    let sqlStatement = 'SELECT * FROM locations WHERE search_query = $1;';
    let value = [queryData];
    return client.query(sqlStatement, value).then(data => {
      //if data in database
      if (data.rowCount > 0) {
        //use data from db and send result
        response.status(200).send(data.rows[0]);
      } else {
        let dataFile = `https://maps.googleapis.com/maps/api/geocode/json?address=${queryData}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        superagent.get(dataFile).end((err, googleMapsApiResponse) => {
          const locationObject = new Location(
            queryData,
            googleMapsApiResponse.body
          );
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
              locationObject.id = result.rows[0].id;
              return locationObject;
            });
          response.status(200).send(locationObject);
        });
      }
    });
  } catch (error) {
    console.log(error);
    response.status(500).send('There is an error on our end sorry');
  }
});

app.get('/weather', (request, response) => {
  try {
    lookupFunction(
      request.query.data,
      'weather',
      weatherDbFetcher,
      weatherApiFetcher
    ).then (weatherData => {
      response.status(200).send(weatherData);
    });
  }catch (error) {
    console.error(error);
    response.status(500).send('Sorry, something went wrong');
  }
});

app.get('/events', (request, response) => {
  try {
    const queryData = request.query.data;
    let dataFile = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${
      queryData.longitude
    }&location.latitude=${queryData.latitude}`;
    superagent
      .get(dataFile)
      .set({ Authorization: `Bearer ${process.env.EVENTBRITE_KEY}` })
      .end((err, eventBriteApiResponse) => {
        let eventMap = eventBriteApiResponse.body.events.map(
          element => new Event(element)
        );
        response.status(200).send(eventMap);
      });
  } catch (error) {
    console.log(error);
    response.status(500).send('There is an error on our end sorry');
  }
});

function lookupFunction(locationData, table, dbFetcher, apiFetcher) {
  //if locations contains searchQuery, execute other functions to fetch their data
  let sqlStatement = `SELECT * FROM ${table} WHERE location_id = $1;`;
  let values = [locationData.id];
  return client.query(sqlStatement, values).then(data => {
    //if data in database
    if (data.rowCount > 0) {
      return data.rows;
    } else {
      return apiFetcher(
        locationData.id,
        locationData.latitude,
        locationData.longitude
      );
    }
  });
}

function weatherDbFetcher(id) {
  //go into weather table and return correct weather object
  let sqlStatement = 'SELECT * FROM weather WHERE location_id = $1;';
  let value = [id];
  return client.query(sqlStatement, value)
    .then( dbResult => dbResult.rows);
}

function weatherApiFetcher(id, latitude, longitude) {
  try {
    let dataFile = `https://api.darksky.net/forecast/${process.env.DARKSKY_KEY}/${latitude},${longitude}`;

    return superagent.get(dataFile).end((err, weatherApiResponse) => {
      let weatherForecastMap = weatherApiResponse.body.daily.data.map(element => {
        return new Weather(element.summary, element.time);
      });
      weatherForecastMap.forEach(element => {
        let insertStatement =
        'INSERT INTO weather (location_id, forecast, weather_time) VALUES ( $1, $2, $3);';
        let insertValue = [
          id,
          element.forecast,
          element.time
        ];
        client.query(insertStatement, insertValue);
      });

      return weatherForecastMap;
    });
  } catch(error){
    console.log(error);
    response.status(500).send('There is an error on our end sorry');
  }
}

function handleError(err, res) {
  console.error(err);
  if (res) res.status(500).send('Sorry, something went wrong');
}
