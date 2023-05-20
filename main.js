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
const bodyParser = require('body-parser')

let con;

const oszust = 'Nie ma tak nigerze mały!';

 // configuration of nodemailer module used for sending emails
const sus_email_address = 'noreply.sus@gmail.com';
let mail_client = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: sus_email_address,
    pass: 'fnoizumcdgzkrisd'
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

 // this function returns a hex representation of a sha256 hash of the password parameter
function create_hash(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

 // this function adds a specified user to the database
 // used for debugging
async function create_user(username, password, czy_admin) {
  let password_hash = create_hash(password);
  console.log(password_hash);
  let query = "INSERT INTO users (username, password_hash, czy_admin) VALUES (?, ?, ?);";
  await con.execute(query, [username, password_hash, czy_admin]);
}

 // this function initialises the con variable for sql queries
async function connect_to_database(host, user, password, database) {
  con = await mysql_promise.createConnection({
    host: host,
    user: user,
    password: password,
    database: database
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


async function main() {

  if(await connect_to_database("localhost", "sqluser", "imposter", "sus_database") !== 0) {
    console.log("Problem z bazą danych");
    return -1;
  }
  // create_user('admin', 'admin', 1);
  // create_user('twoj_stary', '2137', 0);
  // return 0;

  // configuring environment variables
  dotenv.config();

  // initialising the express app
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // CORS is required when Node.js acts as an external server
  const cors=require("cors");
  const corsOptions ={
    origin:'*',
    credentials:false, //access-control-allow-credentials:true
    optionSuccessStatus:200,
  }
  app.use(cors(corsOptions))

  app.use(bodyParser.urlencoded({
    extended: false
  }));


  // user authentication - sending/verifying a JSON Web Token
  app.post('/auth', upload.none(), async function(request, response) {

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
    let [rows, columns] = await con.execute(query, [username, create_hash(password)]);

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
      token: newToken
    });
    response.end();
  });

  // activating an account
  app.post('/aktywuj', upload.none(), async function(request, response) {

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
    let [rows, columns] = await con.execute(query, [key]);
    if (rows.length === 0) {
      response.json({
        success: false,
        message: 'Niewłaściwy klucz'
      });
      return;
    }

    query = 'SELECT * FROM users WHERE username = ?';
    [rows, columns] = await con.execute(query, [username]);
    if (rows.length > 0) {
      response.json({
        success: false,
        message: 'Użytkownik o takiej nazwie już istnieje'
      });
      return;
    }

    query = "UPDATE users SET username = ?, password_hash = ?, adres_email = ? WHERE username = ?;";
    await con.execute(query, [username, create_hash(password), email, key]);
    response.json({
      success: true,
      message: 'Użytkownik został pomyślnie stworzony'
    });
    response.end();
  });

  app.post('/zmien_haslo', upload.none(), async function (request, response) {

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let tokenData = getTokenData(token);
    let username = tokenData.username;
    let password_old = request.body.password_old;
    let password_new = request.body.password_new1;

    let query = "UPDATE users SET password_hash = ? WHERE username = ? AND password_hash = ?;";
    let res = await con.execute(query, [create_hash(password_new), username, create_hash(password_old)]);

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

  });

  // sending the user data necessary for the form for adding new rows
  app.get('/available_values', async function (request, response) {

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let [rows, columns] = await con.execute('SELECT * FROM lokalizacje;');
    let lok = {};
    for(let i in rows) {
      lok[rows[i]['lokalizacja_id']] = rows[i]['lokalizacja_nazwa'];
    }

    [rows, columns] = await con.execute('SELECT * FROM kategorie;');
    let kat = {};
    for(let i in rows) {
      kat[rows[i]['kategoria_id']] = rows[i]['kategoria_nazwa'];
    }

    [rows, columns] = await con.execute('SELECT * FROM podmioty;');
    let pod = {};
    for(let i in rows) {
      pod[rows[i]['podmiot_id']] = rows[i]['podmiot_nazwa'];
    }

    [rows, columns] = await con.execute('SELECT * FROM statusy;');
    let statusy = {};
    for(let i in rows) {
      statusy[rows[i]['status_id']] = rows[i]['status_nazwa'];
    }

    [rows, columns] = await con.execute('SELECT * FROM stany ORDER BY kategoria_id, stan_id');
    let stany = {};
    for(let i in rows) {
      if(!stany.hasOwnProperty(rows[i]["kategoria_id"])) {
        stany[rows[i]["kategoria_id"]] = {};
      }
      stany[rows[i]["kategoria_id"]][rows[i]["stan_id"]] = rows[i]["stan_nazwa"];
    }

    [rows, columns] = await con.execute('SELECT stan_id, stan_nazwa FROM stany GROUP BY stan_id, stan_nazwa ORDER BY stan_id');
    let stanyAll = {};
    for(let i in rows) {
      stanyAll[rows[i]['stan_id']] = rows[i]['stan_nazwa'];
    }

    response.json({
      success: true,
      data: {podmioty: pod, statusy: statusy, lokalizacje: lok, kategorie: kat, stany: stany, stanyAll: stanyAll}
    });
    response.end();
  });

  app.post('/wyswietl', upload.none(), async function (request, response){

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
    `;

    let conditions = []; // array to store individual conditions for each column, later to be joined with OR
    let clauses = ['sprzet.czy_usuniete = 0']; // array to store joined conditions form before, later to be joined with AND

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

    if(request.body['nazwa']['nazwa']) {
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


    let clause = clauses.join(' AND ');
    if(clause) {
      query += ' WHERE ' + clause;
    }

    let order = request.body['sortOrder'].join(',');
    if(order) {
      query += ' ORDER BY ' + order;
    }

    query += ';';


    let [rows, columns] = await con.execute(query);
    response.json({
      success: true,
      data: rows
    });

  });

  // adding the new row to the database
  app.post('/dodaj', upload.single('zdjecie'), function (request, response) {

    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false)) return;

    let body = request.body;

    let nazwa = body["nazwa"];
    let ilosc = body["ilosc"];
    let status = body["status"];
    let kategoria = body["kategoria"];
    let stan = body["stan"];
    let lokalizacja = body["lokalizacja"];
    let wlasciciel = body["wlasciciel"];
    let uzytkownik = body["uzytkownik"];
    let opis = body["opis"];

    console.log(nazwa, ilosc, status, kategoria, stan, lokalizacja, wlasciciel, uzytkownik, opis);

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
      kategoria_id, stan_id, lokalizacja_id, 
      wlasciciel_id, uzytkownik_id, opis) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      con.execute(query, [nazwa, ilosc, status, kategoria, stan, lokalizacja, wlasciciel, uzytkownik, opis]);
    }
    else {
      let zdjecie_path = '/images/' + request.file.filename;

      const query = `INSERT INTO sprzet 
      (nazwa, ilosc, status_id, 
      kategoria_id, stan_id, lokalizacja_id, 
      wlasciciel_id, uzytkownik_id, opis, zdjecie_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      con.execute(query, [nazwa, ilosc, status, kategoria, stan, lokalizacja, wlasciciel, uzytkownik, opis, zdjecie_path]);
    }

    response.json({
      success: true
    });
  });

  // generating an account activation key
  app.post('/generuj_klucz', upload.none(), async function (request, response) {

    let token = request.headers["x-access-token"];
    if(verifyToken(token, false) && !verifyToken(token, true)) {
      response.json({
        success: false,
        message: "Funkcja dostępna tylko dla użytkowników z uprawnieniami administratorskimi"
      });
      response.end();
      return;
    }
    if(!verifyToken(token, true))
      return;

    console.log(request.body);

    let czy_admin = request.body.czy_admin ? 1 : 0;
    let data = request.body.data ? request.body.data : null;

    let username = czy_admin ? 'a_' : '';
    username += generate_random_string(10);

    let query = 'INSERT INTO users (username, password_hash, czy_admin, data_wygasniecia) VALUES (?, ?, ?, ?);';
    await con.execute(query, [username, -1, czy_admin, data]);

    response.json({
      success: true,
      klucz: username
    });
    response.end();
  });

  app.get('/uzytkownicy', upload.none(), async function (request, response) {

    let token = request.headers["x-access-token"];
    if(verifyToken(token, false) && !verifyToken(token, true)) {
      response.json({
        success: false,
        message: "Funkcja dostępna tylko dla użytkowników z uprawnieniami administratorskimi"
      });
      response.end();
      return;
    }
    if(!verifyToken(token, true))
      return;

    let query = "SELECT username, czy_admin, data_wygasniecia, adres_email FROM users";
    let [rows, columns] = await con.execute(query);

    response.json({
      success: true,
      data: rows
    });
    response.end();
  });

  // performing a custom query to the database
  // DROP and DELETE keywords are forbidden
  app.post('/query', upload.none(), async function (request, response) {

    let token = request.headers["x-access-token"];
    if(verifyToken(token, false) && !verifyToken(token, true)) {
      response.json({
        success: false,
        message: "Funkcja dostępna tylko dla użytkowników z uprawnieniami administratorskimi"
      });
      response.end();
      return;
    }
    if(!verifyToken(token, true))
      return;

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
    }
    catch(err) {
      response.json({
        success: false,
        message: "Nastąpił błąd podczas wykonywania query"
      });
      console.log(err);
      response.end();
    }
  });

  // sending the password reset code via e-mail
  // the reset code is password hash since it is already in the database and knowing it is not a security concern
  // (as long as it is not a frequently used password :skull:)
  app.post('/send_reset_code', upload.none(), async function(request, response) {
    let username = request.body.username;
    let query = "SELECT adres_email, password_hash FROM sus_database.users WHERE users.username=?";

    let [rows, columns] = await con.execute(query, [username]);
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
        })
        .catch(error => {
          response.json({
            success: false,
            message: 'Wystąpił błąd, spróbuj ponownie później'
          });
        });
  });

  // checking the reset code and sending the temporary token
  app.post('/check_reset_code', upload.none(), async function(request, response) {
    let username = request.body.username;
    let code = request.body.code;
    let query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?;';
    let [rows, columns] = await con.execute(query, [username, code]);
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

  });

  // changing one's password from the reset form
  app.post('/resetuj_haslo', upload.none(), async function(request, response) {
    let token = request.headers["x-access-token"];
    if(!verifyToken(token, false, true))
      return;

    let username = getTokenData(token)['username'];
    if(!username)
      return;
    let password = request.body.password1;
    let query = 'UPDATE users SET password_hash = ? WHERE username = ?;';
    let [rows, columns] = await con.execute(query, [create_hash(password), username]);
    // console.log(username, password, rows);
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

  });




  // Not implemented with React yet


  // deleting a user from the list
  app.post('/panel/uzytkownicy/usun', async function (request, response) {
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let username = request.body.username;
    if (username === request.session.username) {
      response.send("lol nie możesz usunąć własnego konta");
      return;
    }
    let query = "DELETE FROM users WHERE username = ?;";
    await con.execute(query, [username]);
    response.redirect('/panel/uzytkownicy');
  });






  app.post('/sprzet_panel/wyswietl/usun', function (request, response) {
    let conditions = [];
    request.body.toDelete.forEach((x) => {
      conditions.push(`sprzet.przedmiot_id = ${x}`);
    });
    let query = `UPDATE 
    sus_database.sprzet
    SET sprzet.czy_usuniete = 1 
    WHERE ${conditions.join(' OR ')}
    `;
    con.execute(query);
    response.end();
  });




  app.get('/sprzet_panel/edytuj', function(request, response) {
    if(!request.query.id) {
      response.redirect('/sprzet_panel/wyswietl');
      return;
    }
    request.session.editid = request.query.id;
    response.sendFile(__dirname + '/user_panel/sprzet_panel/edytuj_sprzet.html');
  });

  app.post('/sprzet_panel/edytuj/info', async function (request, response) {
    let [rows, columns] = await con.execute(`SELECT *
                                             FROM sus_database.sprzet
                                             WHERE przedmiot_id = ${request.session.editid}`);
    response.json({
      kat: rows[0]['kategoria_id'],
      lok: rows[0]['lokalizacja_id'],
      wla: rows[0]['wlasciciel_id'],
      uzy: rows[0]['uzytkownik_id'],
      stn: rows[0]['stan_id'],
      sts: rows[0]['status_id'],
      nazwa: rows[0]['nazwa'],
      ilosc: rows[0]['ilosc'],
      opis: rows[0]['opis']});
    response.end();
  });

  app.post('/sprzet_panel/edytuj/auth', upload.single('zdjecie'), function (request, response) {
    let body = request.body;

    let kat = body['kat_id'];
    let lok = body['lok_id'];
    let wla = body['wla_id'];
    let uzy = body['uzy_id'];
    let sts = body['sts_id'];
    let stn = body['stn_id'];
    let naz = body['nazwa'];
    let ilo = body['ilosc'];
    let opis = body['opis'];

    if (kat == '0' || lok == '0' || wla == '0' || uzy == '0' || sts == '0' || stn == '0' || ilo == '' || naz == '') {
      response.json({"msg": "Niepoprawne dane"});
      return
    }

    if (!request.file) {
      let sql = 'UPDATE sus_database.sprzet t\n' +
          'SET t.nazwa = ?, t.kategoria_id = ?, t.ilosc = ?, t.lokalizacja_id = ?, t.wlasciciel_id = ?,\n' +
          't.uzytkownik_id = ?, t.status_id = ?, t.stan_id = ?, t.opis = ?\n' +
          'WHERE t.przedmiot_id = ?';
      con.execute(sql, [naz, kat, ilo, lok, wla, uzy, sts, stn, opis, request.session.editid]);
    } else {
      let zdj = '/images/' + request.file.filename;
      let sql = 'UPDATE sus_database.sprzet t\n' +
          'SET t.nazwa = ?, t.kategoria_id = ?, t.ilosc = ?, t.lokalizacja_id = ?, t.zdjecie_path = ?, t.wlasciciel_id = ?,\n' +
          't.uzytkownik_id = ?, t.status_id = ?, t.stan_id = ?, t.opis = ?\n' +
          'WHERE t.przedmiot_id = ?';
      con.execute(sql, [naz, kat, ilo, lok, zdj, wla, uzy, sts, stn, opis, request.session.editid]);
    }
    response.json({'redirect': '/sprzet_panel/wyswietl'});
  });

  app.post('/sprzet_panel/zabierz', async function(request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let query = 'INSERT into sus_database.sprzet (nazwa, kategoria_id, ilosc, lokalizacja_id, zdjecie_path, wlasciciel_id, uzytkownik_id, status_id, stan_id, opis, og_id) SELECT nazwa, kategoria_id, ?, lokalizacja_id, zdjecie_path, wlasciciel_id, uzytkownik_id, 2, stan_id, opis, ? FROM sus_database.sprzet WHERE sprzet.przedmiot_id=?; ';
    let newID = await con.execute(query, [request.body['amount'], request.body['id'], request.body['id']]);
    newID = newID[0].insertId;
    query = "UPDATE sus_database.sprzet SET ilosc = ilosc - ? where przedmiot_id = ?";
    await con.execute(query, [request.body['amount'], request.body['id']]);

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
    let [rows, columns] = await con.execute(query, [newID]);
    response.json({'newRow': build_table_sprzet(rows)});
    response.end();
  });

  app.post('/sprzet_panel/odloz', function(request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let query = `UPDATE sus_database.sprzet SET czy_usuniete = 1 WHERE przedmiot_id=?;`;
    con.execute(query, [request.body['id']]);
    query = "UPDATE sus_database.sprzet SET ilosc = ilosc + ? where przedmiot_id = ?";
    con.execute(query, [request.body['amount'], request.body['ogid']]);
    response.end();
  });

  app.post('/sprzet_panel/zapomnij', function(request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let query = `UPDATE sus_database.sprzet SET og_id = null WHERE przedmiot_id=?;`;
    con.execute(query, [request.body['id']]);
    response.end();
  });

  app.listen(3001, '0.0.0.0');
  console.log("Server listening at localhost:3001")
}


main();

 // the code below is used to add debug users to the database
// connect_to_database("localhost", "sqluser", "imposter", "sus_database");
// setTimeout(function() {
// create_user('admin', 'admin', 1);
// create_user('twoj_stary', '2137', 0);
// }, 1000);