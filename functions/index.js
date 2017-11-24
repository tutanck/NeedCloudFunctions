// The Cloud Functions for Firebase SDK to create Cloud Functions and setup triggers.
const functions = require('firebase-functions');

// The Firebase Admin SDK to access the Firebase Realtime Database. 
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

// Firestore handler
var db = admin.firestore();


const algoliasearch = require('algoliasearch');

// App ID and API Key are stored in functions config variables
const ALGOLIA_ID = functions.config().algolia.app_id;
const ALGOLIA_ADMIN_KEY = functions.config().algolia.api_key;

const client = algoliasearch(ALGOLIA_ID, ALGOLIA_ADMIN_KEY);


//TODO Manage dates and concurrency : must be indempotent and coherent


const coll = require('./coll');



const USERS_INDEX_NAME = "USERS";

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
    
    //remove from index offline users
    if(user.availability===-1) {
        return index.deleteObject(userID, function(err, content) {
            console.log(2,"syncUser::deleteObject(",userID,"):",content,err);
        });
    }
    
    //Document minimization 
    delete user.resume;
    delete user.lastRead;
    delete user.tariff;
    delete user.instanceIDToken;
    delete user.type;   
    
    // Add an "objectID" field which Algolia requires
    user.objectID = userID;
    
    //Debug
    console.log(1,"Will attempt to re-index: user/",userID ,"\n -->curr=",user ,"\n -->prev=",previous);
    
    // Write to the algolia index
    const index = client.initIndex(USERS_INDEX_NAME);
    return index.saveObject(user, function(err, content) {
        console.log(2,"syncUser::saveObject(",user,"):",content,err);
    });
    
    return null;
});







const _KEYWORDS_INDEX_NAME = "_KEYWORDS";

//USERS_KEYWODRS index manager
exports.syncUserKeywords = functions.firestore
.document(USERS_INDEX_NAME+'/{userID}/'+_KEYWORDS_INDEX_NAME+'/{keywordID}')
.onWrite(event => {
    
    //userID
    const userID =  event.params.userID;
    
    //keywordID
    const keywordID =  event.params.keywordID;
    
    // Get an object with the previous document value
    var previous = event.data.previous?event.data.previous.data():null;
    
    // Get an object with the current document value
    var keyword = event.data.data();
    
    // Get a reference to the user that own the keyword
    var userRef = db.collection(USERS_INDEX_NAME).doc(userID);
    
    // Get a reference to the user keyword's collection
    var userKeywordsRef = userRef.collection(_KEYWORDS_INDEX_NAME);
    
    //Get all user keywords for indexing
    return userKeywordsRef.get().then(snapshot => {
        const kTab = [];
        
        snapshot.forEach(doc => {
            //console.log(2,doc.id, '=>', doc.data());//debug
            if(!doc.get('deleted') && doc.get('active'))
                kTab.push(doc.get('keyword'));
        });    
        
        //new keywords-object for re-indexing
        const keywords = {
            keywords: kTab,
            objectID: userID
        };
        
        //Debug
        console.log(2,"Will attempt to re-index:",userKeywordsRef.path,"\n -->keywords=",keywords);
        
        // Write to the algolia index
        const index = client.initIndex(_KEYWORDS_INDEX_NAME);
        return index.partialUpdateObject(keywords, function(err, content) {
            console.log(2,"syncUserKeywords::partialUpdateObject(",keywords,"):",content,err);
        });
        
    })
    .catch(err => {
        console.log(2,'syncUserKeywords','userRef : Error getting document','userID=',userID, err);
    });
    
    return null;
});








const _NEEDS_INDEX_NAME = "_NEEDS";

//USERS_NEEDS index manager
exports.syncUserNeed = functions.firestore
.document(USERS_INDEX_NAME+'/{userID}/'+_NEEDS_INDEX_NAME+'/{needID}')
.onWrite(event => {
    
    //userID
    const userID =  event.params.userID;
    
    //needID
    const needID =  event.params.needID;
    
    // Get an object with the previous document value
    var previous = event.data.previous?event.data.previous.data():null;
    
    // Get an object with the current document value
    var need = event.data.data();
    
    // Get a reference to the user that own the need
    var userRef = db.collection(USERS_INDEX_NAME).doc(userID);
    
    // Get a reference to the user's need 
    var userNeedRef = userRef.collection(_NEEDS_INDEX_NAME).doc(needID);
    
    // Get a reference to the need's applicants collection
    var userNeedApplicantsRef = userNeedRef.collection(_APPLICANTS_INDEX_NAME);
    
    coll.deleteCollection(db,userNeedApplicantsRef,25).then(function(result) {
        console.log(2,userNeedApplicantsRef.path, "has been successfully deleted."); 
    }, function(err) {
        console.log(2,"an error occured while deleting",userNeedApplicantsRef.path,err); 
    });
    
    
    if(!need.deleted && need.active){
        
        //Debug
        console.log(1,"Will attempt to re-index:", userNeedRef.path
        ,"\n -->curr=",need ,"\n -->prev=",previous);
        
        // Write to the algolia index
        const index = client.initIndex(_NEEDS_INDEX_NAME);
        return index.saveObject(need, function(err, content) {
            console.log(2,"syncUserNeed::saveObject(",need,"):",content,err);
        });
        
    }else{
        //Debug
        console.log(1,"Irrelevant to index:",userNeedRef.path
        ,"\n -->curr=",need ,"\n -->prev=",previous);
        
        // Remove from the algolia index
        return index.deleteObject(needID, function(err, content) {
            console.log(2,"syncUserNeed::deleteObject(",needID,"):",content,err);
        });
    }
    
    return null;
});











/*DB TRIGGERS*/ 


const _RATINGS_INDEX_NAME = "_RATINGS";

//User's ratings aggregation
exports.aggregateRatings = functions.firestore
.document(USERS_INDEX_NAME+'/{userID}/'+_RATINGS_INDEX_NAME+'/{ratingId}')
.onWrite(event => {
    
    //userID
    const userID =  event.params.userID;
    
    //keywordID
    const ratingId =  event.params.ratingId;
    
    // Get value of the newly added rating
    var ratingVal = event.data.get('rating');
    
    // Get a reference to the rated user
    var userRef = db.collection(USERS_INDEX_NAME).doc(userID);
    
    // Get a reference to the rated user ratings collection
    var userRatingsRef = userRef.collection(_RATINGS_INDEX_NAME) ;
    
    //debug
    console.log(1,'aggregateRatings','userID='+userID
    ,'ratingId='+ratingId,'ratingVal='+ratingVal);
    
    // Update aggregations in a transaction
    return db.runTransaction(transaction => {
        return transaction.get(userRatingsRef).then(snapshot => {
            let nbVoters = 0;
            let ratingsSum = 0;
            
            snapshot.forEach(doc => {
                ratingsSum += doc.get('rating');
                nbVoters++;      
                
                //debug
                console.log(2,'aggregateRatings','userID='+userID
                ,'ratingId='+ratingId,'ratingVal='+ratingVal
                ,'ratingsSum='+ratingsSum,'nbVoters='+nbVoters
                ,doc.id, '=>', doc.data());
            });
            
            let avgRating = nbVoters == 0 ? 0 : ratingsSum / nbVoters;
            
            //debug
            console.log(3,'aggregateRatings','userID='+userID
            ,'ratingId='+ratingId,'ratingVal='+ratingVal
            ,"avgRating="+avgRating,"nbVoters="+nbVoters);
            
            // Update user rating infos
            return transaction.update(userRef, {
                avgRating: avgRating,
                nbVoters: nbVoters
            });
            
        })
        .catch(err => {
            console.log('aggregateRatings','userRatingsRef : Error getting user{'+userID+'} ratings', err);
        });       
    });
});






const _APPLICANTS_INDEX_NAME = "_APPLICANTS";

//User's ratings aggregation
exports.manageNeedApplications = functions.firestore
.document(USERS_INDEX_NAME+'/{userID}/'+_NEEDS_INDEX_NAME+'/{needID}/'+_APPLICANTS_INDEX_NAME+'/{applicantID}')
.onCreate(event => {
    
    //userID
    const userID =  event.params.userID;
    
    //needID
    const needID =  event.params.needID;
    
    //applicantID
    const applicantID =  event.params.applicantID;
    
    // Get a reference to the user that own the need
    var userRef = db.collection(USERS_INDEX_NAME).doc(userID);
    
    // Get a reference to the user's need 
    var userNeedRef = userRef.collection(_NEEDS_INDEX_NAME).doc(needID);
    
    // Get a reference to the need's applicants collection
    var userNeedApplicantsRef = userNeedRef.collection(_APPLICANTS_INDEX_NAME);
    
    //Event's data values
    const applicantName = event.data.get('username');
    const needTitle = event.data.get('needTitle');
    const queryString = event.data.get('queryString');
    
    
    //debug
    console.log(1,'manageNeedApplications','userID='+userID
    ,'needID='+needID,'applicantID='+applicantID
    ,'needTitle='+needTitle,'applicantName='+applicantName);
    
    return userRef.get()
    .then(doc => {
        if (!doc.exists) {
            console.log(2,'#SNO','manageNeedApplications','userRef : No such document:','userID='+userID);
        } else {
            console.log(2,'Document data:', doc.data());
            
            let registrationToken = doc.get('instanceIDToken');
            
            var payload = {
                notification: {
                    title: "Proposition de services",
                    body: "Vous avez reçue une proposition de services pour votre besoin '"+needTitle+"' venant de @"+applicantName+".",
                    clickAction : ".domain.components.needs.UserNeedActivity"
                },
                data: {
                    _SuperUser: "FCM",
                    NEED_ID : needID,
                    NEED_TITLE : needTitle,
                    QUERY_STRING : queryString,
                    APPLICANT_ID: applicantID,
                    APPLICANT_NAME: applicantName
                }
            };
            
            var options = {
                priority: "high",
                timeToLive: 60 //TODO(uncomment in prod mod)    * 60 * 24  //24h bf expiration
            };
            
            admin.messaging().sendToDevice(registrationToken, payload, options)
            .then(function(response) {
                console.log(3,"Successfully sent message To {"+userID+"("+registrationToken+")} : response=", response);
            })
            .catch(function(error) {
                console.log(3,"Error sending message To {"+userID+"("+registrationToken+")} : error=", error);
            });
            
        }
    })
    .catch(err => {
        console.log(2,'manageNeedApplications','userRef : Error getting document','userID='+userID, err);
    });
    
});






const MESSAGES_INDEX_NAME = "MESSAGES";

//User's ratings aggregation
exports.messagesNotifications = functions.firestore
.document(MESSAGES_INDEX_NAME+'/{messageID}')
.onCreate(event => {
    
    //messageID
    const messageID =  event.params.messageID;
    
    //fromID
    const fromID =  event.data.get('from');
    
    //toID
    const toID =  event.data.get('to');
    
    //message
    const message =  event.data.get('message');
    
    // Get a reference to the message's recipient
    var toRef = db.collection(USERS_INDEX_NAME).doc(toID);
    
    
    //debug
    console.log(1,'messagesNotifications','messageID='+messageID,'fromID='+fromID,'toID='+toID,'message='+message);
    
    return toRef.get()
    .then(doc => {
        if (!doc.exists) {
            console.log(2,'#SNO','messagesNotifications','userRef : No such document:','userID='+toID);
        } else {
            console.log(2,'Document data:', doc.data());
            
            let registrationToken = doc.get('instanceIDToken');
            let userAvail =  doc.get('availability');
            
            var payload = {
                notification: {
                    title: "Nouveau message",
                    body: message,
                    clickAction : ".domain.components.messages.MessagesActivity"
                },
                data: {
                    _SuperUser: "FCM",
                    CONTACT_ID : fromID
                }
            };
            
            var options = {
                priority: "high",
                timeToLive: 60 //TODO(uncomment in prod mod)    * 60 * 24  //24h bf expiration
            };
            
            if(userAvail===1){//user wants notifications only if he is available
                admin.messaging().sendToDevice(registrationToken, payload, options)
                .then(function(response) {
                    console.log(3,"Successfully sent message To {"+toID+"("+registrationToken+")} : response=", response);
                })
                .catch(function(error) {
                    console.log(3,"Error sending message To {"+toID+"("+registrationToken+")} : error=", error);
                });
            }else{
                console.log(2,'User is not available at the moment... message not sent.');
            }
            
        }
    })
    .catch(err => {
        console.log(2,'messagesNotifications','userRef : Error getting document','userID='+toID, err);
    });
    
});





/*TOOLS*/



// test func
exports.hello = functions.https.onRequest((request, response) => {
    const v =0;
    console.log("my log v="+v);
    response.send("Hello *_* ! v="+v);
});
