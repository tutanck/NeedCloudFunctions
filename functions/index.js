// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

const algoliasearch = require('algoliasearch');

// App ID and API Key are stored in functions config variables
const ALGOLIA_ID = functions.config().algolia.app_id;
const ALGOLIA_ADMIN_KEY = functions.config().algolia.api_key;

const USERS_INDEX_NAME = "USERS";
const _KEYWORDS_INDEX_NAME = "_KEYWORDS";
const _NEEDS_INDEX_NAME = "_NEEDS";

const client = algoliasearch(ALGOLIA_ID, ALGOLIA_ADMIN_KEY);



//USERS index manager
exports.syncUser = functions.firestore
.document(USERS_INDEX_NAME+'/{userID}')
.onWrite(event => {
    
    //userID
    const userID =  event.params.userID;
    
    // Get an object with the previous document value
    var previous = event.data.previous?event.data.previous.data():null;
    
    // Get an object with the current document value
    var user = event.data.data();
    
    //Document minimization 
    delete user.resume;
    delete user.lastRead;
    delete user.tariff;
    delete user.type;
    
    // Add an "objectID" field which Algolia requires
    user.objectID = userID;
    
    //Debug
    console.log("Will attempt to index:  user/"+userID 
    ,"\n -->curr=",user ,"\n -->prev=",previous);
    
    // Write to the algolia index
    const index = client.initIndex(USERS_INDEX_NAME);
    //return index.saveObject(user);
    return null;
});






 









// test func
exports.hello = functions.https.onRequest((request, response) => {
    const v = 0;
    console.log("my log v="+v);
    response.send("Hello *_* ! v="+v);
});
