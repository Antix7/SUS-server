const mysql = require('mysql2');
const mysql_promise = require('mysql2/promise');
const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const handlebars = require('handlebars');
const fs = require('fs');

const crypto = require('crypto');

const myAddress = 'mnbvcxzlkmjnhgfdsapoiuytrewq@gmail.com'; // tbd oficjalny email
const myPasword = 'zxpjpmjufaegyxpx';
let con, await_con;
let myMail = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  safe: true,
  port: 587,
  auth: {
    user: myAddress,
    pass: myPasword
  }
});

function haszuj(txt) {
  /*
  let hash = 0;
  for(let i = 0; i < txt.length; i++) {
    hash *= p;
    //hash += txt[i].toInteger();
    hash += txt.charCodeAt(i);
    hash %= M;
    if(hash < 0)
      hash += M;
  }
  */
  return crypto.createHash('sha256').update(txt).digest('hex');
}

async function create_user(username, password, admin) {
  let hash_password = haszuj(password);
  console.log(hash_password);
  let sql = "INSERT INTO users (Username, PasswordHash, czyAdmin) VALUES ('" + username.toString() + "', '" + hash_password.toString() + "', " + admin.toString() + ");";
  await await_con.execute(sql);
}

async function connect_to_db(myHost, myUser, myPassword, myDatabase) {

  con = mysql.createConnection({
    host: myHost,
    user: myUser,
    password: myPassword,
    database: myDatabase
  });
  await_con = await mysql_promise.createConnection({
    host: 'localhost',
    user: 'sqluser',
    password: 'imposter',
    database: 'test_db'
  });

  con.connect(function(err) {
    if (err) throw err;
    //console.log("Connected!");
  });
  return 0;
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
        '<input type="hidden" name="Username" value="' + ob[i].Username + '"> ' +
        '</form> </td>';
    table += '</tr>';
  }
  table += '</table>';
  return table;
}


async function main() {
  if(await connect_to_db("localhost", "sqluser", "imposter", "test_db") !== 0) {
    console.log("Problem z bazą danych");
    return -1;
  }

  const app = express();
  app.use(session({
    secret: 'joe mama',
    resave: true,
    saveUninitialized: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(__dirname, 'static')));

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
    if(username.includes("'") || username.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let password = request.body.pwd;
    if(!(username && password)) {
      response.sendFile(path.join(__dirname + '/login/zle_dane.html'));
      return;
    }

    let sql = "SELECT * FROM users WHERE Username = '" + username + "' AND PasswordHash = '" + haszuj(password) + "';";
    //console.log(sql);
    let [rows, columns] = await await_con.execute(sql);
    let gut = rows.length !== 0;

    if(!gut) {
      response.sendFile(path.join(__dirname + '/login/zle_dane.html'));
      return;
    }

    if(rows[0].DataWygasniecia != null) {
      let expiration_date = new Date(rows[0].DataWygasniecia);
      let current_date = new Date();
      if (current_date > expiration_date) {
        response.sendFile(__dirname + '/login/wygaslo.html');
        return;
      }
    }

    request.session.loggedin = true;
    request.session.username = username;
    request.session.isadmin = !!rows[0].czyAdmin;
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

  app.get('/panel/dodaj_uzytkownika', function (request, response) {
    if(request.session.isadmin && request.session.loggedin)
      response.sendFile(__dirname + "/admin_panel/dodaj_uzytkownika.html");
    else
      response.sendFile(__dirname + "/login/oszust.html");
  });

  app.post('/panel/dodaj_uzytkownika/auth', function (request, response){
    if(!request.session.loggedin || !request.session.isadmin) {
      response.sendFile(__dirname + '/login/oszust.html');
      return 1;
    }
    let name = '';
    for(let i = 0; i < 10; i++) {
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
    let mailOptions = {
      from: myAddress,
      to: request.body.email,
      subject: "Założenie konta w Systemie Udokumentowywania Sprzętu",
      text: "Witaj!\nOto kod do założenia konta w SUS: " + name
    };
    myMail.sendMail(mailOptions, async function (error, info) {
      if (error) {
        response.send("Coś poszło nie tak");
        console.log(error);
        return;
      }

      let toSend = "Wysłano e-mail na podany adres\n";
      let czyAdmin = '0';
      if (request.body.czyAdmin == 'on')
        czyAdmin = '1';
      let sql = "INSERT INTO users (Username, PasswordHash, czyAdmin) VALUES ('" + name + "', -1, " + czyAdmin + ");";
      //console.log(request.body.expires);
      //console.log(request.body.expires == 'on');
      if (request.body.expires == 'on') {
        let date = request.body.date;
        //console.log(date);
        sql = "INSERT INTO users (Username, PasswordHash, czyAdmin, DataWygasniecia) VALUES " + "('" + name + "', -1, " + czyAdmin + ", '" + date + "');";
      }
      let [rows, columns] = await await_con.execute(sql);
      response.send(toSend);
    });
  });

  app.get('/aktywuj_konto', function (request, response){
    response.sendFile(__dirname + '/login/aktywuj_konto.html');
  });

  app.post('/aktywuj/auth', async function (request, response) {
    let onetime_id = request.body.id;
    if (onetime_id.includes("'") || onetime_id.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let nick = request.body.nick;
    if (nick.includes("'") || nick.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let pwd = request.body.pwd1;
    let sql = "SELECT * FROM users WHERE Username='" + nick + "';";
    let [rows, columns] = await await_con.execute(sql);
    if (rows.length > 0) {
      response.send("Taki użytkownik już istnieje");
      return 0;
    }

    sql = "SELECT * FROM users WHERE Username='" + onetime_id + "' AND PasswordHash=-1;";
    [rows, columns] = await await_con.execute(sql);
    if (rows.length === 0) {
      response.send("Niepoprawny identyfikator");
      return 0;
    }

    sql = "UPDATE users SET Username = '" + nick + "', PasswordHash = '" + haszuj(pwd) + "' WHERE Username='" + onetime_id + "';";
    [rows, columns] = await await_con.execute(sql);
    response.send("Udało się!");
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
    let nick = request.session.username;
    if (nick.includes("'") || nick.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    let old_pwd = request.body.stare;
    let new_pwd = request.body.nowe;
    let sql = "SELECT * FROM users WHERE Username = '" + nick + "' AND PasswordHash = '" + haszuj(old_pwd).toString() + "';";
    let [rows, columns] = await await_con.execute(sql);
    if (rows.length === 0) {
      response.send("stare hasło się nie zgadza");
      response.end();
      return;
    }
    sql = "UPDATE users SET PasswordHash = '" + haszuj(new_pwd).toString() + "' WHERE Username='" + nick + "';";
    await await_con.execute(sql);
    response.send("Hasło zmienione");
    response.end();
  });

  app.get('/panel/uzytkownicy', async function (request, response) {
    if (!(request.session.isadmin && request.session.loggedin)) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let sql = 'SELECT * FROM users';
    let [rows, columns] = await await_con.execute(sql);

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
    let nick = request.body.Username;
    if (nick.includes("'") || nick.includes('"')) {
      response.sendFile(__dirname + '/login/for_injectors.html');
      return;
    }
    if (nick == request.session.username) {
      response.send("lol nie możesz usunąć własnego konta");
      return;
    }
    let sql = "DELETE FROM users WHERE Username = '" + nick.toString() + "';";
    await await_con.execute(sql);
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
    let sql = request.body.query;
    if (sql.toLowerCase().includes('drop') || sql.toLowerCase().includes('delete')) {
      response.send('nie ma usuwania');
      response.end();
      return;
    }
    try {
      let [rows, columns] = await await_con.execute(sql);
      response.send(rows);
      response.end();
    }
    catch(err) {
      response.send("Coś poszło nie tak, sprawdź swój syntax");
      response.end();
      console.log(err);
    }
  });

  app.get('/baza', function(request, response) {
    if(!request.session.loggedin) {
      response.sendFile(__dirname + "/login/oszust.html");
      return;
    }
    let sql = 'SELECT * FROM sprzet';
    response.send('not. yet.');
  });

  app.listen(3000, '0.0.0.0');
}


main();
//connect_to_db("localhost", "sqluser", "imposter", "test_db");
//create_user('admin', 'admin', 1);
//create_user('twoj_stary', '2137', 0);
//console.log(build_table([{"Username":"admin","PasswordHash":2023948189175633,"czyAdmin":1,"DataWygasniecia":null},{"Username":"twoj_stary","PasswordHash":488183148373,"czyAdmin":0,"DataWygasniecia":null}]));

//kms();