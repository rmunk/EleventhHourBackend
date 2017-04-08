// Import the Firebase SDK for Google Cloud Functions.
var functions = require('firebase-functions');
// Import and initialize the Firebase Admin SDK.
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

/**
 * Triggers when a user creates a new booking and sends a notification to provider.
 *
 * Users add a booking to `/bookings/{providerUid}/{bookingUid}`.
 * Provider staff save their device notification tokens to `/notificationTokens/panel/{providerUid}/{notificationToken}`.
 */
exports.sendNewBookingNotification = functions.database.ref('/bookings/{providerUid}/{bookingUid}').onWrite(event => {
    const bookingUid = event.params.bookingUid;
    const providerUid = event.params.providerUid;

    // If booking deleted we exit the function.
    if (!event.data.val()) {
        return console.log('Booking ', bookingUid, 'for provider', providerUid, 'has been deleted.');
    }

       // Only send this notification when booking is first created.
      if (event.data.previous.exists()) {
        return console.log('Booking ', bookingUid, 'for provider', providerUid, 'already exists.');
    }

    // Get booking
    const booking = event.data.val();

    // Get the list of device notification tokens.
    return admin.database().ref(`/notificationTokens/panel/${providerUid}`).once('value').then(result => {
        const tokensSnapshot = result;

        // Check if there are any device tokens.
        if (!tokensSnapshot.hasChildren()) {
            return console.log('There are no notification tokens to send to.');
        }
        console.log('There are', tokensSnapshot.numChildren(), 'tokens to send notifications to.');

        // Notification details.
        const payload = {
            notification: {
                title: 'You have a new booking!',
                body: `${booking.serviceName} from ${booking.userName}.`
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
                }
            });
            return Promise.all(tokensToRemove);
        });
    });
});
