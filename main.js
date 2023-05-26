const mysql_promise = require('mysql2/promise');
const express = require('express');
const jwt = require('jsonwebtoken');
const dotenv = require("dotenv");
const path = require('path');
const handlebars = require('handlebars');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const cors=require("cors");
const {response} = require("express");
const util = require("util");

let con;

const nice_logs_filename = "nice_logs.log",
    nicent_logs_filename = "nicent_logs.log",
    mysql_err_filename = "mysql_errors.log",
    sys_msg_filename = "system_messages.log";

// configuration of nodemailer module used for sending emails;
let mail_client = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SUS_EMAIL_ADDRESS,
    pass: process.env.SUS_EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  }
});

// configuration of multer module used for saving images
const storage = multer.diskStorage({
  destination: (req, file, callBack) => {
    callBack(null, './public/images/')     // './public/images/' directory name where save the file
  },
  filename: (req, file, callBack) => {
    callBack(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
});
const upload = multer({
  storage: storage
});

function log(destination, content) {
  let log_file = fs.createWriteStream(__dirname + '/logs/' + destination, {flags: 'a'});

  let time = new Date().toISOString().replace(/T/, ' ');
  log_file.write(`|${time}| ${util.format(content)}\n`);

  console.log(`|${time}| ${util.format(content)}`);
  log_file.close();
}

// this function returns a hex representation of a sha256 hash of the password parameter
function create_hash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// this function adds a specified user to the database
// used for debugging
async function create_user(username, password, czy_admin) {
  let password_hash = create_hash(password);
  let query = "INSERT INTO users (username, password_hash, czy_admin) VALUES (?, ?, ?);";
  await con.execute(query, [username, password_hash, czy_admin]);
}

// this function initialises the con variable for sql queries
async function connect_to_database(host, user, password, database) {
  con = await mysql_promise.createConnection({
    host: host,
    user: user,
    password: password,
    database: database,
    multipleStatements: true
  });
  return 0;
}

// this function generates a random string for account activation
function generate_random_string(length) {
  let name = '';
  for(let i = 0; i < length; i++) {
    let x = Math.floor(Math.random() * 62);
    // 0 <= x <= 9  =>  dodajemy liczbę x
    // 10 <= x <= 35  =>  dodajemy małą literę o nr x - 10
    // 36 <= x <= 61  =>  dodajemy wielką literę o nr x - 36
    if(x <= 9)
      name += x.toString();
    else if(x <= 35)
      name += String.fromCharCode(x - 10 + 'a'.charCodeAt(0));
    else
      name += String.fromCharCode(x - 36 + 'A'.charCodeAt(0));
  }
  return name;
}


function isObjectEmpty(obj) {
  if(obj === undefined) return true;
  return obj
      && Object.keys(obj).length === 0
      && Object.getPrototypeOf(obj) === Object.prototype;
}

function verifyToken(token, shouldBeAdmin, resetOnly = false) {
  if(!token) return false;
  return jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if(err) return false;
    const tokenAge = new Date() - new Date(decoded.time);
    if(tokenAge > process.env.JWT_LIFETIME) return false;
    if(shouldBeAdmin && (!decoded.isAdmin)) return false;
    if((!resetOnly) && decoded.resetOnly) return false;
    return true;
  });
}

function getTokenData(token) {
  if(!token) return {};
  return jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if(err) return {};
    return decoded;
  });
}


// this function only runs if the "DEVELOPMENT_MODE" property in .env file is set to 1
// it resets the entire database and should NEVER be used outside development
// con.query is used, since con.execute doesn't allow multiple statements
async function developmentScripts() {
  log(sys_msg_filename, "Development mode enabled. Executing development scripts...");

  if(process.env.DEV_MODE_SPRZET_DROP === "1")
    await con.query(fs.readFileSync('./sql_scripts/sprzet_tables_drop.sql').toString());
  if(process.env.DEV_MODE_ASSISTING_DROP === "1")
    await con.query(fs.readFileSync('./sql_scripts/assisting_tables_drop.sql').toString());
  if(process.env.DEV_MODE_ASSISTING_DECLARE === "1")
    await con.query(fs.readFileSync('./sql_scripts/assisting_tables_declaration.sql').toString());
  if(process.env.DEV_MODE_ASSISTING_SETUP === "1")
    await con.query(fs.readFileSync('./sql_scripts/assisting_tables_setup.sql').toString());
  if(process.env.DEV_MODE_SPRZET_DECLARE === "1")
    await con.query(fs.readFileSync('./sql_scripts/sprzet_tables_declaration.sql').toString());

  if(process.env.DEV_MODE_USERS_DROP === "1")
    await con.query(fs.readFileSync('./sql_scripts/users_table_drop.sql').toString());
  if(process.env.DEV_MODE_USERS_DECLARE === "1")
    await con.query(fs.readFileSync('./sql_scripts/users_table_declaration.sql').toString());
  if(process.env.DEV_MODE_USERS_SETUP === "1") {
    await con.query("DELETE FROM sus_database.users;");
    await create_user('admin', 'admin', 1);
    await create_user('twoj_stary', '2137', 0);
  }

  log(sys_msg_filename, "Executed development scripts. Powering up the server");
}

async function main() {

  log('system_messages.log', "main() has been called");
  // configuring environment variables
  dotenv.config();

  const nice_logs = process.env.NICE_EVENT_LOGS === "1";
  const nicent_logs = process.env.NICENT_EVENT_LOGS === "1";

  if(await connect_to_database(
      process.env.MYSQL_HOSTNAME,
      process.env.MYSQL_USERNAME,
      process.env.MYSQL_PASSWORD,
      process.env.MYSQL_DATABASE) !== 0) {
    log(mysql_err_filename, "Nie można połączyć się z bazą danych");
    log(sys_msg_filename, "Nie można połączyć się z bazą danych");
    return -1;
  }

  if(process.env.DEVELOPMENT_MODE === '1')
    await developmentScripts();

  // initialising the express app
  const app = express();

  // CORS is required when Node.js acts as an external server
  let corsOptions = {};
  if(process.env.FOR_PRODUCTION === '1') {
    corsOptions = {
      origin:'https://antix7.github.io',
      credentials:true, //access-control-allow-credentials:true
      optionSuccessStatus:200,
    }
  }
  else {
    corsOptions = {
      origin:'*',
      credentials:false, //access-control-allow-credentials:false
      optionSuccessStatus:200,
    }
  }
  app.use(cors(corsOptions));

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(bodyParser.urlencoded({
    extended: false
  }));

  app.get('/', function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `GET request for '/', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    response.send("Witaj w SUSie");
  });

  // user authentication - sending/verifying a JSON Web Token
  app.post('/auth', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `post request for '/auth', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(verifyToken(token, false)) {
      response.json({
        success: true
      });
      return;
    }

    let username = request.body.username;
    let password = request.body.password;
    if(!(username && password)) {
      response.json({
        success: false,
        message: "Niepoprawna nazwa użytkownika i/lub hasło"
      });
      return;
    }

    let query = "SELECT * FROM users WHERE username = ? AND password_hash = ?;";
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [username, create_hash(password)]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /auth endpoint, query: ${query}, arguments: ${[username, create_hash(password)]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    if(rows.length === 0) {
      response.json({
        success: false,
        message: "Niepoprawna nazwa użytkownika i/lub hasło"
      });
      return;
    }

    if(rows[0].data_wygasniecia != null) {
      let expiration_date = new Date(rows[0].data_wygasniecia);
      let current_date = new Date();
      if (current_date > expiration_date) {
        response.json({
          success: false,
          message: "Konto wygasło"
        });
        return;
      }
    }

    let tokenData = {
      time: new Date(),
      username: username,
      isAdmin: !!rows[0].czy_admin // !! to make sure it is a bool
    }
    const newToken = jwt.sign(tokenData, process.env.JWT_SECRET_KEY);

    response.json({
      success: true,
      token: newToken,
      isAdmin: !!rows[0].czy_admin
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${username}" has logged in from the following ip: "${request.socket.remoteAddress}"`);
  });

  // activating an account
  app.post('/aktywuj', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `post request for '/aktywuj', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let key = request.body.key;
    let username = request.body.username;
    let password = request.body.password1;
    let email = request.body.email;

    if(!(key && username && password)) {
      response.json({
        success: false,
        message: "Brakuje danych"
      });
      return;
    }

    let query = "SELECT * FROM users WHERE username = ? AND password_hash = -1;";
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [key]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /aktywuj endpoint, query: ${query}, arguments: ${[key]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if (rows.length === 0) {
      response.json({
        success: false,
        message: 'Niewłaściwy klucz'
      });
      return;
    }

    query = 'SELECT * FROM users WHERE username = ?';
    try {
      [rows, columns] = await con.execute(query, [username]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /aktywuj endpoint, query: ${query}, arguments: ${[username]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if (rows.length > 0) {
      response.json({
        success: false,
        message: 'Użytkownik o takiej nazwie już istnieje'
      });
      return;
    }

    query = "UPDATE users SET username = ?, password_hash = ?, adres_email = ? WHERE username = ?;";
    try {
      await con.execute(query, [username, create_hash(password), email, key]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /aktywuj endpoint, query: ${query}, arguments: ${[username, create_hash(password), email, key]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.json({
      success: true,
      message: 'Użytkownik został pomyślnie stworzony'
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `new user activated: "${username}"`);
  });

  app.post('/zmien_haslo', upload.none(), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `post request for '/zmien_haslo', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let tokenData = getTokenData(token);
    let username = tokenData.username;
    let password_old = request.body.password_old;
    let password_new = request.body.password_new1;

    let query = "UPDATE users SET password_hash = ? WHERE username = ? AND password_hash = ?;";
    let res;
    try {
      res = await con.execute(query, [create_hash(password_new), username, create_hash(password_old)]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zmien_haslo endpoint, query: ${query}, arguments: ${[create_hash(password_new), username, create_hash(password_old)]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    if(res[0].affectedRows === 0) {
      response.json({
        success: false,
        message: 'Niepoprawne hasło'
      });
      return;
    }
    response.json({
      success: true
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${username}" has changed their password`);
  });

  // sending the user data necessary for the form for adding new rows
  app.get('/available_values', async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `GET request for '/available_values', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;


    let lok = {};
    let kat = {};
    let pod = {};
    let statusy = {};
    let stany = {};
    let stanyAll = {};

    try {
      let [rows, columns] = await con.execute('SELECT * FROM lokalizacje;');
      for (let i in rows) {
        lok[rows[i]['lokalizacja_id']] = rows[i]['lokalizacja_nazwa'];
      }

      [rows, columns] = await con.execute('SELECT * FROM kategorie;');
      for (let i in rows) {
        kat[rows[i]['kategoria_id']] = rows[i]['kategoria_nazwa'];
      }

      [rows, columns] = await con.execute('SELECT * FROM podmioty;');
      for (let i in rows) {
        pod[rows[i]['podmiot_id']] = rows[i]['podmiot_nazwa'];
      }

      [rows, columns] = await con.execute('SELECT * FROM statusy;');
      for (let i in rows) {
        statusy[rows[i]['status_id']] = rows[i]['status_nazwa'];
      }

      [rows, columns] = await con.execute('SELECT * FROM stany ORDER BY kategoria_id, stan_id');
      for (let i in rows) {
        if (!stany.hasOwnProperty(rows[i]["kategoria_id"])) {
          stany[rows[i]["kategoria_id"]] = {};
        }
        stany[rows[i]["kategoria_id"]][rows[i]["stan_id"]] = rows[i]["stan_nazwa"];
      }

      [rows, columns] = await con.execute('SELECT stan_id, stan_nazwa FROM stany GROUP BY stan_id, stan_nazwa ORDER BY stan_id');
      for (let i in rows) {
        stanyAll[rows[i]['stan_id']] = rows[i]['stan_nazwa'];
      }
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /available_values endpoint\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    response.json({
      success: true,
      data: {podmioty: pod, statusy: statusy, lokalizacje: lok, kategorie: kat, stany: stany, stanyAll: stanyAll}
    });
    response.end();
  });

  app.post('/wyswietl', upload.none(), async function (request, response){
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/wyswietl', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    // this is the basic query structure to which a clause will be added
    let query = `SELECT
                   sprzet.przedmiot_id AS ID,
                   sprzet.nazwa AS nazwa,
                   sprzet.ilosc AS ilosc,
                   statusy.status_nazwa AS status,
                   kat.kategoria_nazwa AS kategoria,
                   stany.stan_nazwa AS stan,
                   lok.lokalizacja_nazwa AS lokalizacja,
                   wla.podmiot_nazwa AS wlasciciel,
                   uzy.podmiot_nazwa AS uzytkownik,
                   sprzet.opis AS opis,
                   sprzet.zdjecie_path AS zdjecie_path,
                   sprzet.og_id AS og_id,
                   sprzet.czy_usuniete AS czy_usuniete,
                   sprzet.box_id AS box_id
                 FROM sprzet
                        JOIN lokalizacje AS lok ON sprzet.lokalizacja_id = lok.lokalizacja_id
                        JOIN podmioty AS wla ON sprzet.wlasciciel_id = wla.podmiot_id
                        JOIN podmioty AS uzy ON sprzet.uzytkownik_id = uzy.podmiot_id
                        JOIN statusy ON sprzet.status_id = statusy.status_id
                        JOIN kategorie AS kat ON sprzet.kategoria_id = kat.kategoria_id
                        JOIN stany ON sprzet.kategoria_id = stany.kategoria_id
                   AND sprzet.stan_id = stany.stan_id
    `;
    let conditions = []; // array to store individual conditions for each column, later to be joined with OR
    let clauses = [`sprzet.czy_usuniete = ${request.body['usuniete'] ? 1 : 0}`]; // array to store joined conditions form before, later to be joined with AND

    // we unfortunately need to process each column separately

    if(!isObjectEmpty(request.body['kategoria'])) {
      for(let box in request.body['kategoria']) {
        conditions.push(`sprzet.kategoria_id = ${box.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(!isObjectEmpty(request.body['stan'])) {
      for(let box in request.body['stan']) {
        conditions.push(`stany.stan_id = ${box.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(!isObjectEmpty(request.body['lokalizacja'])) {
      for(let box in request.body['lokalizacja']) {
        conditions.push(`sprzet.lokalizacja_id = ${box.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(!isObjectEmpty(request.body['status'])) {
      for(let box in request.body['status']) {
        conditions.push(`sprzet.status_id = ${box.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body['nazwa'] && request.body['nazwa']['nazwa']) {
      clauses.push(`sprzet.nazwa LIKE '%${request.body['nazwa']['nazwa']}%'`);
    }

    if(!isObjectEmpty(request.body['wlasciciel'])) {
      for(let box in request.body['wlasciciel']) {
        conditions.push(`wla.podmiot_id = ${box.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(!isObjectEmpty(request.body['uzytkownik'])) {
      for(let box in request.body['uzytkownik']) {
        conditions.push(`uzy.podmiot_id = ${box.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body['box_id'] && request.body['box_id']['box_id']) {
      clauses.push(`sprzet.box_id = ${request.body['box_id']['box_id']}`);
    }


    let clause = clauses.join(' AND ');
    if(clause) {
      query += ' WHERE ' + clause;
    }


    let order = [];
    if(request.body['sortOrder']) {
      for(let [field, desc] of request.body['sortOrder']) {
        order.push(field + (desc ? ' DESC ' : ' ASC '));
      }
    }
    if(order.length !== 0) {
      query += ' ORDER BY ' + order.join(',');

    }

    query += ';';

    let rows, columns;
    try {
      [rows, columns] = await con.execute(query);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /wyswietl endpoint, query: ${query}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.json({
      success: true,
      data: rows
    });

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has opened the "sprzet" table`);
  });

  app.post('/wyswietl_zdjecie', upload.none(), async function (request, response){
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/wyswietl_zdjecie', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let query = `SELECT zdjecie_path FROM sprzet WHERE przedmiot_id = ?;`;
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [request.body.id]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /wyswietl_zdjecie endpoint, query: ${query}, arguments: ${[request.body.id]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if(rows[0]['zdjecie_path'] === null) return;
    response.sendFile(`${__dirname}/public/images/${rows[0]['zdjecie_path']}`);

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has opened the following row's photo: "${request.body.id}"`);
  });

  app.post('/usun_sprzet', async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/usun_sprzet', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let query = 'SELECT czy_usuniete FROM sprzet WHERE przedmiot_id = ?;';
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [request.body.id]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /usun_sprzet endpoint, query: ${query}, arguments: ${[request.body.id]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    query = `UPDATE sus_database.sprzet
             SET sprzet.czy_usuniete = ?
             WHERE sprzet.przedmiot_id = ?;`;
    try {
      con.execute(query, [rows[0]['czy_usuniete'] ? 0 : 1, request.body.id]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /usun_sprzet endpoint, query: ${query}, arguments: ${[rows[0]['czy_usuniete'] ? 0 : 1, request.body.id]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    query = "UPDATE sus_database.sprzet SET sprzet.og_id = ? WHERE sprzet.og_id = ?;";
    try {
      con.execute(query, [null, request.body.id]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /usun_sprzet endpoint, query: ${query}, arguments: ${[null, request.body.id]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has deleted/restored the following row: "${request.body.id}"`);
  });

  // adding the new row to the database
  app.post('/dodaj', upload.single('zdjecie'), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/dodaj', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let body = request.body;

    if(body['ilosc'] <= 0) {
      response.json({
        success: false,
        message: "Niepoprawna ilość"
      });
      return;
    }

    let nazwa = body["nazwa"];
    let ilosc = body["ilosc"];
    let status = body["status"];
    let kategoria = body["kategoria"];
    let stan = body["stan"];
    let lokalizacja = body["lokalizacja"];
    let wlasciciel = body["wlasciciel"];
    let uzytkownik = body["uzytkownik"];
    let opis = body["opis"]!=='' ? body["opis"] : null;
    let box_id = body["box_id"]!=='' ? body["box_id"] : null;

    if(!(nazwa && ilosc && status && kategoria && stan && lokalizacja && wlasciciel && uzytkownik)){
      response.json({
        success: false,
        message: "Niepoprawne dane"
      });
      return;
    }

    if(!request.file) {
      const query = `INSERT INTO sprzet
                     (nazwa, ilosc, status_id,
                      kategoria_id, stan_id, lokalizacja_id, box_id,
                      wlasciciel_id, uzytkownik_id, opis)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      try {
        await con.execute(query, [nazwa, ilosc, status, kategoria, stan, lokalizacja, box_id, wlasciciel, uzytkownik, opis]);
      }
      catch(err) {
        log(mysql_err_filename, `mysql error in /dodaj endpoint, query: ${query}, arguments: ${[nazwa, ilosc, status, kategoria, stan, lokalizacja, box_id, wlasciciel, uzytkownik, opis]}\n${err}`);
        response.json({
          success: false,
          message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
        });
        return;
      }
    }
    else {
      let zdjecie_path = request.file.filename;

      const query = `INSERT INTO sprzet
                     (nazwa, ilosc, status_id,
                      kategoria_id, stan_id, lokalizacja_id, box_id,
                      wlasciciel_id, uzytkownik_id, opis, zdjecie_path)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      try {
        await con.execute(query, [nazwa, ilosc, status, kategoria, stan, lokalizacja, box_id, wlasciciel, uzytkownik, opis, zdjecie_path]);
      }
      catch(err) {
        log(mysql_err_filename, `mysql error in /dodaj endpoint, query: ${query}, arguments: ${[nazwa, ilosc, status, kategoria, stan, lokalizacja, box_id, wlasciciel, uzytkownik, opis, zdjecie_path]}\n${err}`);
        response.json({
          success: false,
          message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
        });
        return;
      }
    }

    response.json({
      success: true
    });

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has added a new row`);
  });

  // generating an account activation key
  app.post('/generuj_klucz', upload.none(), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/generuj_klucz', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, true)) return;

    let czy_admin = request.body.czy_admin ? 1 : 0;
    let data = request.body.data ? request.body.data : null;

    let username = czy_admin ? 'a_' : '';
    username += generate_random_string(10);

    let query = 'INSERT INTO users (username, password_hash, czy_admin, data_wygasniecia) VALUES (?, ?, ?, ?);';
    try {
      await con.execute(query, [username, -1, czy_admin, data]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /generuj_klucz endpoint, query: ${query}, arguments: ${[username, -1, czy_admin, data]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    response.json({
      success: true,
      klucz: username
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has generated a new user key: "${username}"`);
  });

  app.get('/uzytkownicy', upload.none(), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/uzytkownicy', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, true)) return;

    let query = "SELECT username, czy_admin, data_wygasniecia, adres_email FROM users";
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /uzytkownicy endpoint, query: ${query}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    response.json({
      success: true,
      data: rows
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has opened the "users" table`);
  });

  app.post('/usun_uzytkownika', async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/usun_uzytkownika', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, true)) return;
    const tokenData = getTokenData(token);

    let username = request.body.username;
    if (username === tokenData.username) {
      response.json({
        success: false,
        message: 'Nie możesz usunąć własnego konta'
      });
      return;
    }
    let query = 'DELETE FROM users WHERE username = ?;';
    try {
      await con.execute(query, [username]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /usun_uzytkownika endpoint, query: ${query}, arguments: ${[username]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.json({success: true});

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has deleted the following user: "${username}"`);
  });

  // performing a custom query to the database
  // DROP and DELETE keywords are forbidden
  app.post('/query', upload.none(), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/query', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, true)) return;

    let query = request.body.query;
    if (query.toLowerCase().includes('drop') || query.toLowerCase().includes('delete')) {
      response.json({
        success: false,
        message: "Query zawiera niedozwolone komendy"
      });
      response.end();
      return;
    }
    try {
      let [rows, columns] = await con.execute(query);
      response.json({
        success: true,
        result: rows
      });
      response.end();

      if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has preformed the following query: "${query}"`);
    }
    catch(err) {
      response.json({
        success: false,
        message: "Nastąpił błąd podczas wykonywania query"
      });
      log(mysql_err_filename, `/query error: ${err}`);
      response.end();

      if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}"'s query has failed: "${query}"`);
    }
  });

  // sending the password reset code via e-mail
  // the reset code is password hash since it is already in the database and knowing it is not a security concern
  // (as long as it is not a frequently used password :skull:)
  app.post('/send_reset_code', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/send_reset_code', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let username = request.body.username;
    let query = "SELECT adres_email, password_hash FROM sus_database.users WHERE users.username=?";

    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [username]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /send_reset_code endpoint, query: ${query}, arguments: ${[username]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if(rows.length === 0) {
      response.json({
        success: false,
        message: "Nie ma takiego użytkownika"
      });
      return;
    }

    let user_email = rows[0].adres_email;
    if(user_email === null) {
      response.json({
        success: false,
        message: 'Konto nie ma przypisanego adresu e-mail'
      });
      return;
    }
    let mail = {
      from: sus_email_address,
      to: user_email,
      subject: 'Reset hasła do SUS',
      text: `Kod do resetu hasła dla użytkownika ${username}: ${rows[0].password_hash}`
    };
    await mail_client.sendMail(mail)
        .then(() => {
          response.json({
            success: true,
            message: 'Pomyślnie wysłano e-mail'
          });

          if(nice_logs) log(nice_logs_filename, `password resetting email for user "${username}" has been sent`);
        })
        .catch(error => {
          response.json({
            success: false,
            message: 'Wystąpił błąd, spróbuj ponownie później'
          });

          if(nice_logs) log(nice_logs_filename, `password resetting email for user "${username}" has failed`);
        });
  });

  // checking the reset code and sending the temporary token
  app.post('/check_reset_code', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/check_reset_code', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let username = request.body.username;
    let code = request.body.code;
    let query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?;';
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [username, code]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /check_reset_code endpoint, query: ${query}, arguments: ${[username, code]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if(rows.length === 0) {
      response.json({
        success: false,
        message: 'Klucz i/lub nazwa użytkownika nieprawidłowa'
      });
      return;
    }

    let tokenData = {
      time: new Date(),
      username: username,
      isAdmin: !!rows[0].czy_admin, // !! to make sure it is a bool
      resetOnly: true
    }
    const newToken = jwt.sign(tokenData, process.env.JWT_SECRET_KEY);
    response.json({
      success: true,
      token: newToken
    });

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has authenticated with reset code from email`);
  });

  // changing one's password from the reset form
  app.post('/resetuj_haslo', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/resetuj_haslo', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false, true))
      return;

    let username = getTokenData(token)['username'];
    if(!username)
      return;
    let password = request.body.password1;
    let query = 'UPDATE users SET password_hash = ? WHERE username = ?;';
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [create_hash(password), username]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /resetuj_haslo endpoint, query: ${query}, arguments: ${[create_hash(password), username]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if(rows.affectedRows === 0) {
      response.json({
        success: false,
        message: 'Coś poszło nie tak'
      });
      return;
    }
    response.json({
      success: true,
      message: 'Pomyślnie zmieniono hasło'
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has reset their password`);
  });

  // endpoint which returns values of one specific row in order to edit said row
  app.post('/editing_info', upload.none(), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/editing_info', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false))
      return;
    if(!request.body.editid) {
      response.json({
        success: false,
        message: "Brak id do edycji"
      });
      return;
    }
    let rows, columns;
    try {
      [rows, columns] = await con.execute(`SELECT *
                                             FROM sus_database.sprzet
                                             WHERE przedmiot_id = ?`, [request.body.editid]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /editing_info endpoint, query: SELECT * FROM sus_database.sprzet WHERE przedmiot_id = ?, arguments: ${[request.body.editid]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    if(rows.length === 0) {
      response.json({
        success: false,
        message: "Przedmiot o takim id nie istnieje"
      })
      return;
    }
    response.json({
      success: true,
      kat: parseInt(rows[0]['kategoria_id']),
      lok: parseInt(rows[0]['lokalizacja_id']),
      wla: parseInt(rows[0]['wlasciciel_id']),
      uzy: parseInt(rows[0]['uzytkownik_id']),
      stn: parseInt(rows[0]['stan_id']),
      sts: parseInt(rows[0]['status_id']),
      nazwa: rows[0]['nazwa'],
      ilosc: rows[0]['ilosc'],
      opis: rows[0]['opis']});
    response.end();
  });

  // editing a row
  app.post('/edytuj', upload.single('zdjecie'), async function (request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/edytuj', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false))
      return;
    let body = request.body;

    if(body['ilosc'] <= 0) {
      response.json({
        success: false,
        message: "Niepoprawna ilość"
      });
      return;
    }

    let kat = body['kategoria'];
    let lok = body['lokalizacja'];
    let wla = body['wlasciciel'];
    let uzy = body['uzytkownik'];
    let sts = body['status'];
    let stn = body['stan'];
    let naz = body['nazwa'];
    let ilo = body['ilosc'];
    let opis = body['opis'];

    if (!(naz && ilo && sts && kat && stn && lok && wla && uzy)) {
      response.json({
        success: false,
        message: "Niepoprawne dane"
      });
      return
    }

    if (!request.file) {
      let query = 'UPDATE sus_database.sprzet t\n' +
          'SET t.nazwa = ?, t.kategoria_id = ?, t.ilosc = ?, t.lokalizacja_id = ?, t.wlasciciel_id = ?,\n' +
          't.uzytkownik_id = ?, t.status_id = ?, t.stan_id = ?, t.opis = ?\n' +
          'WHERE t.przedmiot_id = ?';
      try {
        con.execute(query, [naz, kat, ilo, lok, wla, uzy, sts, stn, opis, body.editid]);
      }
      catch(err) {
        log(mysql_err_filename, `mysql error in /edytuj endpoint, query: ${query}, arguments: ${[naz, kat, ilo, lok, wla, uzy, sts, stn, opis, body.editid]}\n${err}`);
        response.json({
          success: false,
          message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
        });
        return;
      }
    }
    else {
      let zdj = '/images/' + request.file.filename;
      let sql = 'UPDATE sus_database.sprzet t\n' +
          'SET t.nazwa = ?, t.kategoria_id = ?, t.ilosc = ?, t.lokalizacja_id = ?, t.zdjecie_path = ?, t.wlasciciel_id = ?,\n' +
          't.uzytkownik_id = ?, t.status_id = ?, t.stan_id = ?, t.opis = ?\n' +
          'WHERE t.przedmiot_id = ?';
      try {
        con.execute(sql, [naz, kat, ilo, lok, zdj, wla, uzy, sts, stn, opis, body.editid]);
      }catch(err) {
        log(mysql_err_filename, `mysql error in /edytuj endpoint, query: ${query}, arguments: ${[naz, kat, ilo, lok, zdj, wla, uzy, sts, stn, opis, body.editid]}\n${err}`);
        response.json({
          success: false,
          message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
        });
        return;
      }
    }
    response.json({
      success: true
    });

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has edited the row with the following id: "${request.body.editid}"`);
  });


  // the three following endpoints are for og_id related functions

  // taking items from a row
  app.post('/zabierz', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/zabierz', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false))
      return;

    let query = 'SELECT ilosc FROM sprzet WHERE przedmiot_id=?';
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [request.body['id']]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zabierz endpoint, query: ${query}, arguments: ${[request.body['id']]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    let baseAmount = rows[0]['ilosc'];
    if(baseAmount <= request.body['amount'] || request.body['amount'] <= 0) {
      response.json({
        success: false,
        message: "Niepoprawna ilość"
      });
      return;
    }

    query = 'INSERT into sus_database.sprzet (nazwa, kategoria_id, ilosc, lokalizacja_id, zdjecie_path, wlasciciel_id, uzytkownik_id, status_id, stan_id, opis, og_id) SELECT nazwa, kategoria_id, ?, lokalizacja_id, zdjecie_path, wlasciciel_id, uzytkownik_id, 2, stan_id, opis, ? FROM sus_database.sprzet WHERE sprzet.przedmiot_id=?; ';
    let newID;
    try {
      newID = await con.execute(query, [request.body['amount'], request.body['id'], request.body['id']]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zabierz endpoint, query: ${query}, arguments: ${[request.body['amount'], request.body['id'], request.body['id']]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    newID = newID[0].insertId;
    query = "UPDATE sus_database.sprzet SET ilosc = ilosc - ? where przedmiot_id = ?";
    try {
      await con.execute(query, [request.body['amount'], request.body['id']]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zabierz endpoint, query: ${query}, arguments: ${[request.body['amount'], request.body['id']]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }

    query = `SELECT
               sprzet.przedmiot_id AS ID,
               sprzet.nazwa AS nazwa,
               sprzet.ilosc AS ilosc,
               statusy.status_nazwa AS status,
               kat.kategoria_nazwa AS kategoria,
               stany.stan_nazwa AS stan,
               lok.lokalizacja_nazwa AS lokalizacja,
               wla.podmiot_nazwa AS wlasciciel,
               uzy.podmiot_nazwa AS uzytkownik,
               sprzet.opis AS opis,
               sprzet.zdjecie_path AS zdjecie,
               sprzet.og_id AS og_id
             FROM sprzet
                    JOIN lokalizacje AS lok ON sprzet.lokalizacja_id = lok.lokalizacja_id
                    JOIN podmioty AS wla ON sprzet.wlasciciel_id = wla.podmiot_id
                    JOIN podmioty AS uzy ON sprzet.uzytkownik_id = uzy.podmiot_id
                    JOIN statusy ON sprzet.status_id = statusy.status_id
                    JOIN kategorie AS kat ON sprzet.kategoria_id = kat.kategoria_id
                    JOIN stany ON sprzet.kategoria_id = stany.kategoria_id
               AND sprzet.stan_id = stany.stan_id
             WHERE sprzet.przedmiot_id = ?
    `;
    try {
      await con.execute(query, [newID]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zabierz endpoint, query: ${query}, arguments: ${[newID]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.json({success: true});
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has taken away ${request.body["amount"]} row(s) from the row with the following id: ${request.body["id"]}`);
  });
  // putting items back into parent row
  app.post('/odloz', upload.none(), async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/odloz', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false))
      return;
    let query = "SELECT ilosc, og_id FROM sprzet WHERE przedmiot_id=?";
    let rows, columns;
    try {
      [rows, columns] = await con.execute(query, [request.body['id']]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /odloz endpoint, query: ${query}, arguments: ${[request.body['id']]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    if(rows.length === 0) {
      response.json({
        success: false,
        message: "Nie ma przedmiotu z takim id"
      });
      return;
    }
    const amount = rows[0]['ilosc'], og_id = rows[0]['og_id'];
    query = "DELETE FROM sprzet WHERE przedmiot_id=?";
    try {
      await con.execute(query, [request.body['id']]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /odloz endpoint, query: ${query}, arguments: ${[request.body['id']]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    query = "UPDATE sus_database.sprzet SET ilosc = ilosc + ? where przedmiot_id = ?";
    try {
      await con.execute(query, [amount, og_id]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zabierz endpoint, query: ${query}, arguments: ${[amount, og_id]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.json({
      success: true
    });
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" has put ${amount} items back into the row with the following id: "${og_id}"`);
  });
  // forgetting the parent row
  app.post('/zapomnij', async function(request, response) {
    if(nicent_logs)
      log(nicent_logs_filename, `POST request for '/zapomnij', token: ${request.headers["x-access-token"]}, body: ${JSON.stringify(request.body)}`);
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false))
      return;
    let query = `UPDATE sus_database.sprzet SET og_id = null WHERE przedmiot_id=?;`;
    try {
      await con.execute(query, [request.body['id']]);
    }
    catch(err) {
      log(mysql_err_filename, `mysql error in /zabierz endpoint, query: ${query}, arguments: ${[request.body['id']]}\n${err}`);
      response.json({
        success: false,
        message: "Na serwerze pojawił się błąd, najlepiej skontaktuj się z administratorem"
      });
      return;
    }
    response.json({
      success: true
    })
    response.end();

    if(nice_logs) log(nice_logs_filename, `user "${getTokenData(token).username}" forgor og_id for the row with the following id: "${request.body['id']}"`);
  });

  if(process.env.FOR_PRODUCTION === '1') {
    app.listen(3001);
  }
  else {
    app.listen(3001, '0.0.0.0');
  }
  log('system_messages.log', 'Server listening at localhost:3001');
}

main();
