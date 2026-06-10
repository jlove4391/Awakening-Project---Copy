import { gapi } from 'gapi-script';

const initClient = () => {
  gapi.load('client', () => {
    gapi.client.init({
      apiKey: 'YOUR_GOOGLE_API_KEY', // optional for calendar, required for Sheets/Drive
      clientId: '135645140461-cv9h849uruapqcqmhsp6gnah9nb5nqlg.apps.googleusercontent.com',
      discoveryDocs: [
        'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest',
        'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
        'https://sheets.googleapis.com/$discovery/rest?version=v4'
      ],
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    }).then(() => {
      console.log('✅ GAPI client initialized');
    }).catch((e) => {
      console.error('❌ Error initializing GAPI client', e);
    });
  });
};

export default initClient;
