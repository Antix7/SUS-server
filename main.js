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
 // used solely for debugging
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

 // the three functions below use the for ... in .. loops, which iterate through the properties of an object

 // this function returns a string with an HTML table based on the object parameter
 // used for user list in admin panel
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
    form += `<input type="checkbox" name="${form_id}_${values[1]}">`;
    form += `<label for="${form_id}_${values[1]}">${values[0]}</label><br>` //perhaps there is a cleaner way of doing it?
  }
  return form + '</form>';
}

 // these two functions together return a string with an HTML table based on the object parameter
 // the first one is for the headers, the second one for the body
 // it's made this way so it's easier if we load the data in chunks, not all at once
 // used for 'sprzet' table
function build_thead_sprzet(ob) {

  let table = '<thead>';
  for (let i in ob[0]) {
    if(i === "ID")
      table += "<th>wybierz</th>";
    else
      table += `<th>${i}</th>`;
  }
  table += "<th>edytuj</th>";
  table += '</thead>';

  return table;
}
function build_table_sprzet(ob) {
  let table = '';
  for(let i in ob) {
    table += '<tr>';
    table += '<td><input type = "checkbox" class="selectRow" value = "' + ob[i]['ID'] + '"></td>';
    for(let j in ob[i]) {
      if(j === 'ID')
        continue;
      table += '<td>';
      if(j === 'zdjecie')
        table += `<img src="${ob[i][j]}" alt="brak">`;
      else
        table += ob[i][j];
      table += '</td>';
    }
    table += `<td> <form class="edytuj" id="edytuj-${ob[i]['ID']}"> <input type="submit" value="💀"> </form> </td>`;
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

  // initialising the express app
  const app = express();
  app.use(session({
    secret: 'joe mama',
    resave: true,
    saveUninitialized: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'public')));

  // homepage
  app.get('/', function(request, response) {
    response.sendFile(path.join(__dirname + '/login/index.html'));
  });

  // logging out
  app.get('/wyloguj', function(request, response) {
    request.session.loggedin = false;
    request.session.isadmin = false;
    request.session.username = null;
    response.redirect('/');
  })

  // checking whether the login & password of the user are correct
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
    request.session.isadmin = !!rows[0].czy_admin;  // !! to make sure it is a bool
    response.redirect('/panel');
    response.end();

  });

  // main app panel
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

  // page for generating keys for new users & adding them to the database
  // only accessible for administrators
  app.get('/panel/generuj_klucz', function (request, response){
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }
    response.sendFile(__dirname + '/admin_panel/generuj_klucz.html');
  });

  // sending the admin a randomly generated key for new user and adding the key to the database
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

  // page for account activation
  app.get('/aktywuj_konto', function (request, response){
    response.sendFile(__dirname + '/login/aktywuj_konto.html');
  });

  // activating the account of a new user
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

  // page for initialising the resetting of one's password
  app.get('/resetuj_haslo', function (request, response){
    response.sendFile(__dirname + '/login/resetuj_haslo/resetuj_haslo.html');
  });

  // sending the reset code via e-mail
  // the reset code is password hash since it is already in the database and knowing it is not a security concern
  // (as long as it is not a frequently used password :skull:)
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

  // checking the code and redirecting to the reset form if correct
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

  // actual page for resetting one's password
  app.get('/resetuj_haslo_form', function(request, response) {
    if(!request.session.username) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }
    response.sendFile(__dirname + '/login/resetuj_haslo/resetuj_haslo_form.html');
  });

  // changing one's password from the reset form
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

  // page for changing own password from the main panel
  app.get('/panel/zmien_haslo', function(request, response) {
    if(request.session.loggedin)
      response.sendFile(__dirname + '/login/zmien_haslo.html');
    else
      response.sendFile(__dirname + '/login/oszust.html');
  });

  // changing own password from the main panel
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

  // page containing the list of all the users
  // only accessible for administrators
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

  // page for performing special SQL queries
  // only accessible for administrators
  app.get('/panel/query', function (request, response) {
    if(!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/admin_panel/sql_query.html');
  });

  // performing the special SQL query
  // it's worth noting that it is forbidden to use the DROP or DELETE clauses
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

  // page with the panel for accessing the main database
  app.get('/sprzet_panel', function (request, response) {
    if (!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/sprzet_panel.html');
  });

  // page for displaying the main database
  app.get('/sprzet_panel/wyswietl', async function (request, response) {

    if (!request.session.loggedin) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/wyswietl_sprzet.html');

  });

  app.get('/sprzet_panel/wyswietl/filters', async function (request, response) {
    if (!request.session.loggedin) {
      return;
    }

    let query, rows, columns, form_name, result = {};

    form_name = 'kategoria';
    query = 'SELECT kategoria_nazwa, kategoria_id FROM kategorie;';
    [rows, columns] = await con.execute(query);
    result[form_name] = build_sprzet_select_form(rows, form_name);

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

  app.post('/sprzet_panel/wyswietl/filters/stany', async function(request, response) {
    if (!request.session.loggedin) {
      return;
    }

    if(!request.body.kategoria) return;

    let conditions = []; // array to store individual conditions for each column, later to be joined with OR

    for(let box of request.body.kategoria) {
      conditions.push(`kategoria_id = ${box.name.split('_').at(-1)}`);
    }

    let query = `SELECT stan_nazwa, stan_id FROM stany WHERE ${conditions.join(' OR ')} 
    GROUP BY stan_id, stan_nazwa ORDER BY stan_id`;
    let [rows, columns] = await con.execute(query);

    response.send(build_sprzet_select_form(rows, 'stan'));

  });

  app.post('/sprzet_panel/wyswietl/auth', async function (request, response){
    if (!request.session.loggedin) {
      response.sendFile(__dirname + '/login/oszust.html');
      return;
    }

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
    sprzet.zdjecie_path AS zdjecie
    FROM sprzet
    JOIN lokalizacje AS lok ON sprzet.lokalizacja_id = lok.lokalizacja_id
    JOIN podmioty AS wla ON sprzet.wlasciciel_id = wla.podmiot_id
    JOIN podmioty AS uzy ON sprzet.uzytkownik_id = uzy.podmiot_id
    JOIN statusy ON sprzet.status_id = statusy.status_id
    JOIN kategorie AS kat ON sprzet.kategoria_id = kat.kategoria_id
    JOIN stany ON sprzet.kategoria_id = stany.kategoria_id
    AND sprzet.stan_id = stany.stan_id
    WHERE sprzet.czy_usuniete = 0
    `;

    let conditions = []; // array to store individual conditions for each column, later to be joined with OR
    let clauses = []; // array to store joined conditions form before, later to be joined with AND

    // we unfortunately need to process each column separately, TODO find a better way of doing this

    if(request.body.kategoria) {
      for(let box of request.body.kategoria) {
        conditions.push(`sprzet.kategoria_id = ${box.name.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body.stan) {
      for(let box of request.body.stan) {
        conditions.push(`stany.stan_id = ${box.name.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body.lokalizacja) {
      for(let box of request.body.lokalizacja) {
        conditions.push(`sprzet.lokalizacja_id = ${box.name.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body.status) {
      for(let box of request.body.status) {
        conditions.push(`sprzet.status_id = ${box.name.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body.nazwa[0].value) {
      clauses.push(`sprzet.nazwa LIKE '%${request.body.nazwa[0].value}%'`);
    }

    if(request.body.wlasciciel) {
      for(let box of request.body.wlasciciel) {
        conditions.push(`wla.podmiot_id = ${box.name.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    if(request.body.uzytkownik) {
      for(let box of request.body.uzytkownik) {
        conditions.push(`uzy.podmiot_id = ${box.name.split('_').at(-1)}`);
      }
      clauses.push(`(${conditions.join(' OR ')})`);
      conditions = [];
    }

    let clause = clauses.join(' AND ');
    if(clause) {
      query += ' WHERE ' + clause;
    }
    query += ';';

    let [rows, columns] = await con.execute(query);
    response.send(build_thead_sprzet(rows)+build_table_sprzet(rows));

  });
  // TODO not loading the whole table at once

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

  // page for adding new rows to the 'sprzet' table
  app.get('/sprzet_panel/dodaj', function (request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    response.sendFile(__dirname + '/user_panel/sprzet_panel/dodaj_sprzet.html');
  });

  // sending the user data necessary for the form for adding new rows
  app.post('/sprzet_panel/dodaj/dropdowns', async function (request, response) {
    if (!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }

    let [rows, columns] = await con.execute('SELECT * FROM lokalizacje;');
    let lok = [];
    for(let i in rows) {
      lok.push([rows[i]['lokalizacja_nazwa'], rows[i]['lokalizacja_id']]);
    }

    [rows, columns] = await con.execute('SELECT * FROM kategorie;');
    let kat = [];
    for(let i in rows) {
      kat.push([rows[i]['kategoria_nazwa'], rows[i]['kategoria_id']]);
    }

    [rows, columns] = await con.execute('SELECT * FROM podmioty;');
    let pod = [];
    for(let i in rows) {
      pod.push([rows[i]['podmiot_nazwa'], rows[i]['podmiot_id']]);
    }

    [rows, columns] = await con.execute('SELECT * FROM statusy;');
    let sta = [];
    for(let i in rows) {
      sta.push([rows[i]['status_nazwa'], rows[i]['status_id']]);
    }

    response.json({podmioty: pod, statusy: sta, lokalizacje: lok, kategorie: kat});
    response.end();
  });

  // sending the user more necessary data for the form for adding new rows
  // to be precise: it sends states that can be chosen for a new object;
  //                it is separate because it depends on the chosen category
  app.post('/sprzet_panel/dodaj/stany', async function (request, response) {
    if (!(request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let kat = request.get("X-kategoria");
    let [rows, columns] = await con.execute('SELECT * FROM stany WHERE kategoria_id = ?;', [kat.toString()]);
    let sta = [];
    for (let i in rows) {
      sta.push([rows[i]['stan_nazwa'], rows[i]['stan_id']]);
    }
    response.json({stany: sta});
    response.end();
  });

  // adding the new row to the database
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

    if(kat == '0' || lok == '0' || wla == '0' || uzy == '0' || sts == '0' || stn == '0' || ilo == '' || naz == ''){
      response.json({"msg": "Niepoprawne dane"});
      return
    }

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
    response.json({'redirect':'/sprzet_panel'});
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

  app.listen(3000, '0.0.0.0');
}


main();

 // the code below is used to add debug users to the database
// connect_to_database("localhost", "sqluser", "imposter", "sus_database");
// setTimeout(function() {
// create_user('admin', 'admin', 1);
// create_user('twoj_stary', '2137', 0);
// }, 1000);