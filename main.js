const mysql_promise = require('mysql2/promise');
const express = require('express');
const session = require('express-session');
const path = require('path');
const handlebars = require('handlebars');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const nodemailer = require('nodemailer');

let con;
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

const storage = multer.diskStorage({
  destination: (req, file, callBack) => {
    callBack(null, './public/images/')     // './public/images/' directory name where save the file
  },
  filename: (req, file, callBack) => {
    callBack(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
  }
})

const upload = multer({
  storage: storage
});

function create_hash(password) {

  return crypto.createHash('sha256').update(password).digest('hex');

}

async function create_user(username, password, czy_admin) {

  let password_hash = create_hash(password);
  console.log(password_hash);
  let query = "INSERT INTO users (username, password_hash, czy_admin) VALUES (?, ?, ?);";
  await con.execute(query, [username, password_hash, czy_admin]);

}

async function connect_to_database(host, user, password, database) {

  con = await mysql_promise.createConnection({
    host: host,
    user: user,
    password: password,
    database: database
  });

  return 0;
}

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

function build_table_users(ob) {
  let table = '<table><tr>';
  for(let i in ob[0]) {
    table += '<th>' + i.toString() + '</th>';
  }
  table += '<th> guziczki </th>';
  table += '</tr>';
  for(let i in ob) {
    table += '<tr>';
    for(let j in ob[i]) {
      table += '<td>';
      table += ob[i][j];
      table += '</td>';
    }
    table += '<td> ' +
        '<form action="/panel/uzytkownicy/usun" method="post"> ' +
        '<input type="submit" value="usuń"> ' +
        '<input type="hidden" name="username" value="' + ob[i].username + '"> ' +
        '</form> </td>';
    table += '</tr>';
  }
  table += '</table>';
  return table;
}

function build_sprzet_select_form(rows, form_id) {
  let values, form = `<b class="form_title">${form_id}</b><br><form id="${form_id}_form">`;
  for(let option of rows) {
    values = Object.values(option);
    form += `<input type="checkbox" id="${form_id}_${values[1]}">`;
    form += `<label for="${form_id}_label_${values[1]}">${values[0]}</label><br>` //perhaps there is a cleaner way of doing it?
  }
  return form + '</form>';
}

function build_thead_sprzet(ob) {

  let table = '<thead>';
  for (let i in ob[0]) {
    table += `<th>${i}</th>`;
  }
  table += '</thead>';

  return table;
}
function build_table_sprzet(ob) {

  let table = '';
  for(let i in ob) {
    table += '<tr>';
    for(let j in ob[i]) {
      table += '<td>';
      if(j === 'Zdjęcie')
        table += `<img src="${ob[i][j]}" alt="brak">`;
      else
        table += ob[i][j];
      table += '</td>';
    }
    table += '</tr>';
  }

  return table;
}

async function main() {
  if(await connect_to_database("localhost", "sqluser", "imposter", "sus_database") !== 0) {
    console.log("Problem z bazą danych");
    return -1;
  }

  // create_user('admin', 'admin', 1);
  // create_user('twoj_stary', '2137', 0);
  // return 0;

  const app = express();
  app.use(session({
    secret: 'joe mama',
    resave: true,
    saveUninitialized: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  //app.use(multer().none());

  app.get('/', function(request, response) {
    response.sendFile(path.join(__dirname + '/login/index.html'));
  });

  app.get('/wyloguj', function(request, response) {
    request.session.loggedin = false;
    request.session.isadmin = false;
    request.session.username = null;
    response.redirect('/');
  })

  app.post('/auth', async function(request, response) {

    let username = request.body.nick;
    let password = request.body.pwd;
    if(!(username && password)) {
      response.sendFile(path.join(__dirname + '/login/zle_dane.html'));
      return;
    }

    let query = "SELECT * FROM users WHERE username = ? AND password_hash = ?;";
    let [rows, columns] = await con.execute(query, [username, create_hash(password)]);

    if(rows.length === 0) {
      response.sendFile(path.join(__dirname + '/login/zle_dane.html'));
      return;
    }

    if(rows[0].data_wygasniecia != null) {
      let expiration_date = new Date(rows[0].data_wygasniecia);
      let current_date = new Date();
      if (current_date > expiration_date) {
        response.sendFile(__dirname + '/login/wygaslo.html');
        return;
      }
    }

    request.session.loggedin = true;
    request.session.username = username;
    request.session.isadmin = !!rows[0].czy_admin;
    response.redirect('/panel');
    response.end();

  });

  app.get('/panel', function(request, response) {
    if(request.session.loggedin) {
      if(request.session.isadmin)
        response.sendFile(__dirname + '/admin_panel/index.html');
      else
        response.sendFile(__dirname + '/user_panel/index.html');
    }
    else
      response.sendFile(__dirname + '/login/oszust.html');
  })

  app.get('/panel/generuj_klucz', function (request, response){
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }
    response.sendFile(__dirname + '/admin_panel/generuj_klucz.html');
  });

  app.post('/panel/generuj_klucz/auth', async function (request, response) {
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }

    let czy_admin = request.body.czy_admin ? 1 : 0;
    let data = request.body.data ? request.body.data : null;

    let username = czy_admin ? 'a_' : '';
    username += generate_random_string(10);

    let query = 'INSERT INTO users (username, password_hash, czy_admin, data_wygasniecia) VALUES (?, ?, ?, ?);';
    await con.execute(query, [username, -1, czy_admin, data]);

    response.json({message: username});
    response.end();

  });

  app.get('/aktywuj_konto', function (request, response){
    response.sendFile(__dirname + '/login/aktywuj_konto.html');
  });

  app.post('/aktywuj_konto/auth', async function (request, response) {

    let key = request.body.key;
    let username = request.body.username;
    let password = request.body.password1;
    let email = request.body.email;

    let query = "SELECT * FROM users WHERE username = ? AND password_hash = -1;";
    let [rows, columns] = await con.execute(query, [key]);
    if (rows.length === 0) {
      response.json({message: 'Niewłaściwy klucz'});
      return;
    }
    query = 'SELECT * FROM users WHERE username = ?';
    [rows, columns] = await con.execute(query, [username]);
    if (rows.length > 0) {
      response.json({message: 'Użytkownik o takiej nazwie już istnieje'});
      return;
    }
    query = "UPDATE users SET username = ?, password_hash = ?, adres_email = ? WHERE username = ?;";
    await con.execute(query, [username, create_hash(password), email, key]);
    response.json({message: 'Użytkownik został pomyślnie stworzony'});
    response.end();

  });

  app.get('/resetuj_haslo', function (request, response){
    response.sendFile(__dirname + '/login/resetuj_haslo/resetuj_haslo.html');
  });

  app.post('/resetuj_haslo/get_code', async function (request, response) {
    let username = request.body.username;
    let query = 'SELECT adres_email, password_hash FROM users WHERE username = ?;';
    let [rows, columns] = await con.execute(query, [username]);
    if(rows.length === 0) {
      response.send('Taki użytkownik nie istnieje')
      return;
    }
    let user_email = rows[0].adres_email;
    if(user_email === null) {
      response.send('Konto nie ma przypisanego adresu e-mail')
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
          response.send('Pomyślnie wysłano e-mail')
        })
        .catch(error => {
          response.send('Wystąpił błąd, spróbuj ponownie później');
        });

  });

  app.post('/resetuj_haslo/submit_code', async function(request, response) {
    let username = request.body.username;
    let code = request.body.code;
    let query = 'SELECT * FROM users WHERE username = ? AND password_hash = ?;';
    let [rows, columns] = await con.execute(query, [username, code]);
    if(rows.length === 0) {
      response.send({text: 'Klucz i/lub nazwa użytkownika nieprawidłowa'});
      return;
    }
    request.session.username = username;
    response.send({redirect: '/resetuj_haslo_form'});

  });

  app.get('/resetuj_haslo_form', function(request, response) {
    if(!request.session.username) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }
    response.sendFile(__dirname + '/login/resetuj_haslo/resetuj_haslo_form.html');
  });

  app.post('/resetuj_haslo_form/auth', async function(request, response) {
    let username = request.session.username;
    if(!username) {
      response.send('Nie ma tak nigerze mały');
    }
    let password = request.body.password1;
    let query = 'UPDATE users SET password_hash = ? WHERE username = ?;';
    let [rows, columns] = await con.execute(query, [create_hash(password), username]);
    console.log(username, password, rows);
    if(rows.affectedRows === 0) {
      response.send({text: 'Coś poszło nie tak'});
      return;
    }
    request.session.username = null;
    response.send({text: 'Pomyślnie zmieniono hasło', success: true});
    response.end();

  });

  app.get('/panel/zmien_haslo', function(request, response) {
    if(request.session.loggedin)
      response.sendFile(__dirname + '/login/zmien_haslo.html');
    else
      response.sendFile(__dirname + '/login/oszust.html');
  });

  app.post('/panel/zmien_haslo/auth', async function (request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }

    let username = request.session.username;
    let password_old = request.body.password_old;
    let password_new = request.body.password_new1;

    let query = "UPDATE users SET password_hash = ? WHERE username = ? AND password_hash = ?;";
    let res = await con.execute(query, [create_hash(password_new), username, create_hash(password_old)]);

    if(res[0].affectedRows === 0) {
      response.json({message: 'Hasło niepoprawne'});
      return;
    }
    response.json({message: 'Pomyślnie zmieniono hasło'});
    response.end();

  });

  app.get('/panel/uzytkownicy', async function (request, response) {
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let query = 'SELECT * FROM users';
    let [rows, columns] = await con.execute(query);

    const templateStr = fs.readFileSync(__dirname + '/admin_panel/uzytkownicy.html').toString('utf8');
    const template = handlebars.compile(templateStr, {noEscape: true});
    const contents = template({tablebody: build_table_users(rows)});
    response.send(contents);
    response.end();
  });

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

  app.get('/panel/query', function (request, response) {
    if(!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/admin_panel/sql_query.html');
  });

  app.post('/panel/query/perform', async function (request, response) {
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let query = request.body.query;
    if (query.toLowerCase().includes('drop') || query.toLowerCase().includes('delete')) {
      response.send('nie ma usuwania');
      response.end();
      return;
    }
    try {
      let [rows, columns] = await con.execute(query);
      response.send(rows);
      response.end();
    }
    catch(err) {
      response.send("Coś poszło nie tak, sprawdź swój syntax");
      response.end();
      console.log(err);
    }
  });

  app.get('/sprzet_panel', function (request, response) {
    if (!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/sprzet_panel.html');
  });

  app.get('/sprzet_panel/wyswietl', async function (request, response) {

    if (!request.session.loggedin) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/wyswietl_sprzet.html');

  });

  app.get('/sprzet_panel/wyswietl/filters', async function (request, response) {
    if (!request.session.loggedin) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }

    let query, rows, columns, form_name, result = {};

    form_name = 'kategoria';
    query = 'SELECT kategoria_nazwa, kategoria_id FROM kategorie;';
    [rows, columns] = await con.execute(query);
    result[form_name] = build_sprzet_select_form(rows, form_name);

    // stan

    form_name = 'lokalizacja';
    query = 'SELECT lokalizacja_nazwa, lokalizacja_id FROM lokalizacje;';
    [rows, columns] = await con.execute(query);
    result[form_name] = build_sprzet_select_form(rows, form_name);

    form_name = 'status';
    query = 'SELECT status_nazwa, status_id FROM statusy;';
    [rows, columns] = await con.execute(query);
    result[form_name] = build_sprzet_select_form(rows, form_name);

    form_name = 'wlasciciel';
    query = 'SELECT podmiot_nazwa, podmiot_id FROM podmioty;';
    [rows, columns] = await con.execute(query);
    result[form_name] = build_sprzet_select_form(rows, form_name);
    form_name = 'uzytkownik';
    result[form_name] = build_sprzet_select_form(rows, form_name);

    response.send(result);
  });

  app.post('/sprzet_panel/wyswietl/auth', async function (request, response){




  });

  app.get('/sprzet_panel/dodaj', function (request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/dodaj_sprzet.html');
  });

  app.post('/sprzet_panel/dodaj/dropdowns', async function (request, response) {
    if (!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }

    let [rows, columns] = await con.execute('SELECT * FROM lokalizacje;');
    let lok = [];
    for(let i in rows) {
      lok.push(rows[i]['lokalizacja_nazwa']);
    }

    [rows, columns] = await con.execute('SELECT * FROM kategorie;');
    let kat = [];
    for(let i in rows) {
      kat.push(rows[i]['kategoria_nazwa']);
    }

    [rows, columns] = await con.execute('SELECT * FROM podmioty;');
    let pod = [];
    for(let i in rows) {
      pod.push(rows[i]['podmiot_nazwa']);
    }

    [rows, columns] = await con.execute('SELECT * FROM statusy;');
    let sta = [];
    for(let i in rows) {
      sta.push(rows[i]['status_nazwa']);
    }


    response.json({podmioty: pod, statusy: sta, lokalizacje: lok, kategorie: kat});
    response.end();
  });

  app.post('/sprzet_panel/dodaj/stany', async function (request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let kat = request.get("X-kategoria");
    [rows, columns] = await con.execute('SELECT * FROM stany WHERE kategoria_id = ?;', [kat.toString()]);
    let sta = [];
    for (let i in rows) {
      sta.push(rows[i]['stan_nazwa']);
    }
    response.json({stany: sta});
    response.end();
  });

  app.post('/sprzet_panel/dodaj/auth', upload.single('zdjecie'), function (request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
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

    if(!request.file) {
      let sql = 'INSERT INTO sus_database.sprzet (nazwa, kategoria_id, ilosc, lokalizacja_id, wlasciciel_id,\n' +
          '                                 uzytkownik_id, status_id, stan_id, opis)\n' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);\n';
      con.execute(sql, [naz, kat, ilo, lok, wla, uzy, sts, stn, opis]);
    }
    else {
      let zdj = '/images/' + request.file.filename;
      let sql = 'INSERT INTO sus_database.sprzet (nazwa, kategoria_id, ilosc, lokalizacja_id, zdjecie_path, wlasciciel_id,\n' +
          '                                 uzytkownik_id, status_id, stan_id, opis)\n' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);\n';
      con.execute(sql, [naz, kat, ilo, lok, zdj, wla, uzy, sts, stn, opis]);
    }
    response.redirect('/sprzet_panel');
  });

  app.get('/sprzet_panel/modyfikuj', function (request, response) {
    if (!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/modyfikuj_sprzet.html');
  });

  app.listen(3000, '0.0.0.0');
}


main();
// connect_to_database("localhost", "sqluser", "imposter", "sus_database");
// setTimeout(function() {
// create_user('admin', 'admin', 1);
// create_user('twoj_stary', '2137', 0);
// }, 1000);

// let sql = 'SELECT\n' +
//     '    sprzet.nazwa as Nazwa,\n' +
//     '    sprzet.ilosc as Ilość,\n' +
//     '    sprzet.zdjecie_path as Zdjęcie,\n' +
//     '    kat.kategoria_nazwa as Kategoria,\n' +
//     '    lok.lokalizacja_nazwa as Lokalizacja,\n' +
//     '    wla.podmiot_nazwa as Właściciel,\n' +
//     '    uzy.podmiot_nazwa as Użytkownik,\n' +
//     '    stat.status_nazwa as Status,\n' +
//     '    stan.stan_nazwa as Stan,\n' +
//     '    sprzet.opis as Opis\n' +
//     '\n' +
//     'FROM sprzet\n' +
//     'JOIN lokalizacje lok ON lok.lokalizacja_id = sprzet.lokalizacja_id\n' +
//     'JOIN kategorie kat on kat.kategoria_id = sprzet.kategoria_id\n' +
//     'JOIN podmioty wla on wla.podmiot_id = sprzet.wlasciciel_id\n' +
//     'JOIN statusy stat on stat.status_id = sprzet.status_id\n' +
//     'JOIN stany stan on stan.kategoria_id = sprzet.kategoria_id AND stan.stan_id = sprzet.stan_id\n' +
//     'JOIN podmioty uzy on uzy.podmiot_id = sprzet.uzytkownik_id\n' +
//     // 'WHERE sprzet.przedmiot_id >= 1 AND sprzet.przedmiot_id < 51';
//     ';';