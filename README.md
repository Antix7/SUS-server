
# System-Udokumentowywania-Sprzetu-SUS
Amogus ඞ

## About the project 
This project is being created by Antoni Klejman and Patryk Grabowski. Its main purpose is to document
and have easy access to information about the contents of <a href="http://www.burza.yum.pl">Szczep Burza</a>'s (<a href="https://www.facebook.com/szczep151">Facebook</a>) warehouses  
Before continuing, please <a href="https://www.facebook.com/profile.php?id=100078831583129"> leave a like</a>.

## Dependencies
The following programs must be installed in order for SUS to work: 

	node.js (version 18.12)
	npm (version 8.19)
	MySQL (version 8.0)
We also use various node.js packages as listed in package.json

## Setup

    1. create a mysql database called "sus_database"
    2. add a user with username 'sqluser' and password 'imposter' (or any other credentials as long as you change them it in .env)
    3. run `npm install` in the project directory
    4. either run the scripts from /sql_scripts manually or turn on development mode in .env (it is advised to later turn it off)


## How to use the program:

    1. start the main.js file using node
    2. the server will open on localhost:3001

## Front-end
The front-end code can be found in the [SUS-UI](https://github.com/Antix7/SUS-UI) repository 
If you wish to have only one program running, you may use the code from the `legacy-system`
branch, however it is no longer supported
