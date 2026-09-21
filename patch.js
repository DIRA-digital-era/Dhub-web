const fs = require('fs');
const file = 'C:/Users/Lenovo/DIRA_APPS/Dhub-Web/src/screens/landlord/UploadListingScreen.tsx';
let content = fs.readFileSync(file, 'utf8');
if (!content.includes('AsyncStorage')) {
  content = content.replace("import * as ImagePicker from 'expo-image-picker';", "import * as ImagePicker from 'expo-image-picker';\nimport AsyncStorage from '@react-native-async-storage/async-storage';");
}
const regex = /\} catch \(err: any\) \{\s+console\.error\('Error creating listing:', err\);\s+showAlert\('Error', err\.message \|\| 'Failed to create listing\. Please try again\.'\);\s+abortControllerRef\.current = null;\s+setLoading\(false\);\s+\}/g;
const newCatch = `} catch (err: any) {
      console.error('Error creating listing:', err);
      const errMsg = err.message || '';
      if (errMsg.includes('row-level security') || errMsg.includes('42501')) {
        AsyncStorage.removeItem(\`kyc_status_\${user?.id}\`);
        showAlert(
          'KYC Verification Required',
          'Your KYC status is pending or rejected. Please verify your identity before uploading.',
          [
            { text: 'Cancel', onPress: () => navigation.goBack(), style: 'cancel' },
            { text: 'Verify Now', onPress: () => navigation.navigate('KYCVerification' as never) }
          ]
        );
      } else {
        showAlert('Error', err.message || 'Failed to create listing. Please try again.');
      }
      abortControllerRef.current = null;
      setLoading(false);
    }`;
if (regex.test(content)) {
  content = content.replace(regex, newCatch);
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully patched UploadListingScreen Web');
} else {
  console.log('Could not find exact catch block to replace with regex.');
}
