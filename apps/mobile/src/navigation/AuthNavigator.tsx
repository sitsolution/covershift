import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import SplashScreen from '../screens/auth/SplashScreen';
import SelectRoleScreen from '../screens/auth/SelectRoleScreen';
import SignUpDoctorScreen from '../screens/auth/SignUpDoctorScreen';
import SignUpNurseScreen from '../screens/auth/SignUpNurseScreen';
import SignUpOTTechScreen from '../screens/auth/SignUpOTTechScreen';
import SignUpHousekeepingScreen from '../screens/auth/SignUpHousekeepingScreen';
import SignUpAdminScreen from '../screens/auth/SignUpAdminScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import OTPVerificationScreen from '../screens/auth/OTPVerificationScreen';
import GoogleSignupScreen from '../screens/auth/GoogleSignupScreen';

export type AuthStackParamList = {
  Splash: undefined;
  SelectRole: undefined;
  SignUpDoctor: undefined;
  SignUpNurse: undefined;
  SignUpOTTech: undefined;
  SignUpHousekeeping: undefined;
  SignUpAdmin: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  OTPVerification: { email: string; debugOtp?: string | null };
  GoogleSignup: { googleEmail: string; googleName: string; idToken: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="SelectRole" component={SelectRoleScreen} />
      <Stack.Screen name="SignUpDoctor" component={SignUpDoctorScreen} />
      <Stack.Screen name="SignUpNurse" component={SignUpNurseScreen} />
      <Stack.Screen name="SignUpOTTech" component={SignUpOTTechScreen} />
      <Stack.Screen name="SignUpHousekeeping" component={SignUpHousekeepingScreen} />
      <Stack.Screen name="SignUpAdmin" component={SignUpAdminScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="OTPVerification" component={OTPVerificationScreen} />
      <Stack.Screen name="GoogleSignup" component={GoogleSignupScreen} />
    </Stack.Navigator>
  );
}
