// Import the Firebase SDK for Google Cloud Functions.
var functions = require('firebase-functions');
// Import and initialize the Firebase Admin SDK.
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

/**
 * Triggers when a user creates a new booking or canceles existing one and sends a notification to provider.
 *
 * Users add a booking to `/bookings/{providerUid}/{bookingUid}`.
 * Provider staff save their device notification tokens to `/notificationTokens/panel/{providerUid}/{notificationToken}`.
 */
exports.sendNotificationToProvider = functions.database.ref('/providerAppointments/{providerUid}/data/{bookingUid}').onWrite(event => {
    console.log('sendNotificationToProvider v0.2.1');

    const bookingUid = event.params.bookingUid;
    const providerUid = event.params.providerUid;

    // If booking is deleted we exit the function.
    if (!event.data.val()) {
        return console.log('Booking ', bookingUid, 'has been deleted.');
    }

    // Get booking
    const booking = event.data.val();
    const oldBooking = event.data.previous.val();

    // Oh no! Booking is null
    if (!booking) {
        return console.log('Booking ', bookingUid, 'is null.');
    }    

    // Send only if booking status has changed
    if (oldBooking && oldBooking.status == booking.status) {
        return console.log('Booking ', bookingUid, 'status did not change.');
    }

    // Send only if user has made a new booking or canceled it
    if (booking.status != 0 && booking.status != -2) {
        return console.log('Booking ', bookingUid, 'status changed by provider.');
    }

    // Get the list of device notification tokens.
    return admin.database().ref(`/app/notificationTokens/panel/${providerUid}`).once('value').then(result => {
        const tokensSnapshot = result;

        // Check if there are any device tokens.
        if (!tokensSnapshot.hasChildren()) {
            return console.log('There are no notification tokens to send to.');
        }
        console.log('There are', tokensSnapshot.numChildren(), 'tokens to send notifications to.');

        const payload = {
            data: {
            	bookingUid: bookingUid,
            	providerUid: booking.providerId,
             }
        };

        // Listing all tokens.
        const tokens = Object.keys(tokensSnapshot.val());

        // Send notifications to all tokens.
        return admin.messaging().sendToDevice(tokens, payload).then(response => {
            // For each message check if there was an error.
            const tokensToRemove = [];
            response.results.forEach((result, index) => {
                const error = result.error;
                if (error) {
                    console.error('Failure sending notification to', tokens[index], error);
                    // Cleanup the tokens who are not registered anymore.
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                    }
                } else {
                    console.log('Notification sent to:' + tokens[index] + " -> " + result);
                }
            });
            return Promise.all(tokensToRemove);
        });
    });
});


/**
 * Triggers when provider confirms booking or canceles existing one and sends a notification to user.
 *
 * Providers respond to booking at `/users/{userUid}/bookings/{bookingUid}`.
 * Users save their device notification tokens to `/notificationTokens/client/{userUid}/{notificationToken}`.
 */
exports.sendNotificationToUser = functions.database.ref('/userAppointments/{userUid}/data/{bookingUid}').onWrite(event => {
    console.log('sendNotificationToUser v0.2.1');

    const bookingUid = event.params.bookingUid;
    const userUid = event.params.userUid;

    // If booking is deleted we exit the function.
    if (!event.data.val()) {
        return console.log('Booking ', bookingUid, 'has been deleted.');
    }

    // Get booking
    const booking = event.data.val();
    const oldBooking = event.data.previous.val();

    // Oh no! Booking is null
    if (!booking) {
        return console.log('Booking ', bookingUid, 'is null.');
    }    

    // Send only if booking status has changed
    if (oldBooking && oldBooking.status == booking.status) {
        return console.log('Booking ', bookingUid, 'status did not change.');
    }

    // Send only if provider accepted, rejected or cancelled
    if (booking.status != 1 && booking.status != -1 && booking.status != -3) {
        return console.log('Booking ', bookingUid, 'status changed by user.');
    }

    // Get the list of device notification tokens.
    return admin.database().ref(`/app/notificationTokens/client/${userUid}`).once('value').then(result => {
        const tokensSnapshot = result;

        // Check if there are any device tokens.
        if (!tokensSnapshot.hasChildren()) {
            return console.log('There are no notification tokens to send to.');
        }
        console.log('There are', tokensSnapshot.numChildren(), 'tokens to send notifications to.');

        const payload = {
            data: {
            	bookingUid: bookingUid,
            	userUid: booking.userId
            }
        };

        // Listing all tokens.
        const tokens = Object.keys(tokensSnapshot.val());

        // Send notifications to all tokens.
        return admin.messaging().sendToDevice(tokens, payload).then(response => {
            // For each message check if there was an error.
            const tokensToRemove = [];
            response.results.forEach((result, index) => {
                const error = result.error;
                if (error) {
                    console.error('Failure sending notification to', tokens[index], error);
                    // Cleanup the tokens who are not registered anymore.
                    if (error.code === 'messaging/invalid-registration-token' ||
                        error.code === 'messaging/registration-token-not-registered') {
                        tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
                    }
                } else {
                    console.log('Notification sent to:' + tokens[index] + " -> " + result);
                }
            });
            return Promise.all(tokensToRemove);
        });
    });
});
