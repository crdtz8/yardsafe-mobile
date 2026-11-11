// Full-screen barcode/QR scanner for tool asset tags.
// IMPORTANT: this file imports expo-camera, so it must only be loaded after
// hasBarcodeScanner() (lib/scanner.ts) confirms the camera is in this app build.
import { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, TextInput, Linking, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult, type BarcodeType } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/theme';

// Every common sticker format — RCG's existing asset tags are 1-D barcodes.
const BARCODE_TYPES: BarcodeType[] = [
  'code128', 'code39', 'code93', 'codabar', 'itf14', 'ean13', 'ean8', 'upc_a', 'upc_e', 'qr', 'datamatrix', 'pdf417',
];

export type TagScannerProps = {
  visible: boolean;
  onClose: () => void;
  /** Called once per scan with the tag text (trimmed). */
  onScanned: (value: string) => void;
};

export default function TagScanner({ visible, onClose, onScanned }: TagScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [typed, setTyped] = useState('');
  const locked = useRef(false);   // the camera reports the same code many times a second

  useEffect(() => {
    if (!visible) return;
    locked.current = false;
    setTyped('');
    setTorch(false);
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission?.granted]); // eslint-disable-line react-hooks/exhaustive-deps

  const deliver = (value: string) => {
    const v = value.trim();
    if (!v || locked.current) return;
    locked.current = true;
    onScanned(v);
  };

  const onBarcode = (r: BarcodeScanningResult) => deliver(r.data ?? '');

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={st.root}>
        {/* Camera (or a permission message) */}
        {!permission ? (
          <View style={st.center}><ActivityIndicator color={colors.cream} size="large" /></View>
        ) : !permission.granted ? (
          <View style={st.center}>
            <Ionicons name="camera-outline" size={44} color={colors.cream} />
            <Text style={st.permTitle}>Camera access needed</Text>
            <Text style={st.permText}>YardSafe uses the camera to read the barcode on a tool's asset tag.</Text>
            {permission.canAskAgain ? (
              <TouchableOpacity style={st.btn} onPress={requestPermission}><Text style={st.btnTxt}>Allow Camera</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity style={st.btn} onPress={() => Linking.openSettings()}><Text style={st.btnTxt}>Open Settings</Text></TouchableOpacity>
            )}
          </View>
        ) : visible ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torch}
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={onBarcode}
          />
        ) : null}

        {/* Overlay: top bar, aiming frame, manual entry */}
        <SafeAreaView style={st.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
          <View style={st.topBar}>
            <TouchableOpacity onPress={onClose} style={st.iconBtn} accessibilityLabel="Cancel scan">
              <Ionicons name="close" size={26} color={colors.white} />
            </TouchableOpacity>
            <Text style={st.title}>Scan Asset Tag</Text>
            {permission?.granted ? (
              <TouchableOpacity onPress={() => setTorch(t => !t)} style={st.iconBtn} accessibilityLabel="Toggle flashlight">
                <Ionicons name={torch ? 'flashlight' : 'flashlight-outline'} size={22} color={colors.white} />
              </TouchableOpacity>
            ) : <View style={st.iconBtn} />}
          </View>

          {permission?.granted && (
            <View style={st.frameWrap} pointerEvents="none">
              <View style={st.frame} />
              <Text style={st.hint}>Line up the barcode on the tool's tag</Text>
            </View>
          )}

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={st.manual}>
              <TextInput
                style={st.manualInput}
                value={typed}
                onChangeText={setTyped}
                placeholder="Sticker won't scan? Type the tag"
                placeholderTextColor="rgba(255,255,255,0.6)"
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => deliver(typed)}
              />
              <TouchableOpacity style={[st.findBtn, !typed.trim() && { opacity: 0.5 }]} disabled={!typed.trim()} onPress={() => deliver(typed)}>
                <Text style={st.btnTxt}>Find</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#000' },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  permTitle:   { color: colors.cream, fontSize: 18, fontWeight: '700', marginTop: 6 },
  permText:    { color: colors.cream, opacity: 0.8, textAlign: 'center', fontSize: 14, lineHeight: 20 },
  btn:         { backgroundColor: colors.greenMd, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 6, marginTop: 8 },
  btnTxt:      { color: colors.white, fontWeight: '700', fontSize: 15 },
  overlay:     { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between' },
  topBar:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 4, backgroundColor: 'rgba(0,0,0,0.45)' },
  iconBtn:     { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title:       { color: colors.white, fontSize: 17, fontWeight: '700' },
  frameWrap:   { alignItems: 'center' },
  frame:       { width: '78%', aspectRatio: 1.8, borderWidth: 3, borderColor: colors.white, borderRadius: 12, backgroundColor: 'transparent' },
  hint:        { color: colors.white, marginTop: 14, fontSize: 14, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  manual:      { flexDirection: 'row', gap: 8, padding: 12, backgroundColor: 'rgba(0,0,0,0.6)' },
  manualInput: { flex: 1, color: colors.white, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 6, paddingHorizontal: 12, height: 46, fontSize: 16 },
  findBtn:     { backgroundColor: colors.greenMd, borderRadius: 6, paddingHorizontal: 18, justifyContent: 'center' },
});
