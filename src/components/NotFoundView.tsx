import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React from 'react';
import { SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../hooks/useAuth';

interface NotFoundViewProps {
    title?: string;
    message?: string;
    showAuthOptions?: boolean;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({
    title,
    message,
    showAuthOptions = false,
}) => {
    const navigation = useNavigation<any>();
    const { user } = useAuth();
    const { colors } = useTheme();

    const handleBackNavigation = () => {
        if (navigation.canGoBack()) {
            navigation.goBack();
        } else if (user) {
            navigation.navigate('StudentTabs', { screen: 'Home' });
        } else {
            navigation.navigate('AuthStack', { screen: 'SignIn' });
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
            <View style={styles.content}>
                <Ionicons name="home-outline" size={64} color={colors.primary} />

                <Text style={[styles.title, { color: colors.text }]}>
                    {title || (user ? 'Listing Not Found' : 'Welcome to DHUB')}
                </Text>

                <Text style={[styles.message, { color: colors.textSecondary }]}>
                    {message || (user
                        ? 'This property may have been removed or is no longer available.'
                        : 'Sign in or create an account to view property details, contact landlords, and make bookings.')}
                </Text>

                {!user && showAuthOptions ? (
                    <View style={styles.authRow}>
                        <TouchableOpacity
                            style={[styles.btn, { backgroundColor: colors.primary }]}
                            onPress={() => navigation.navigate('AuthStack', { screen: 'SignIn' })}
                        >
                            <Text style={[styles.btnText, { color: '#FFF' }]}>Sign In</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.btn, styles.outlineBtn, { borderColor: colors.border }]}
                            onPress={() => navigation.navigate('AuthStack', { screen: 'SignUp' })}
                        >
                            <Text style={[styles.btnText, { color: colors.text }]}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={[styles.btn, { backgroundColor: colors.primary, marginTop: 16 }]}
                        onPress={handleBackNavigation}
                    >
                        <Text style={[styles.btnText, { color: '#FFF' }]}>
                            {navigation.canGoBack() ? 'Go Back' : user ? 'Go to Home' : 'Sign In'}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    title: { fontSize: 22, fontWeight: '700', marginTop: 16, textAlign: 'center' },
    message: { fontSize: 15, textAlign: 'center', marginVertical: 12, lineHeight: 22 },
    authRow: { flexDirection: 'row', gap: 12, marginTop: 16 },
    btn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center' },
    outlineBtn: { borderWidth: 1, backgroundColor: 'transparent' },
    btnText: { fontWeight: '700', fontSize: 15 },
});

export default NotFoundView;
