import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { firestoreDB, COLLECTIONS } from '@/lib/firebase';

const GOLD = '#D4AF37';
const GREEN = '#006B3F';
const BG = '#0A0A0A';
const CARD = '#1A1A1A';
const BORDER = '#2A2A2A';
const TEXT = '#FAFAFA';
const MUTED = '#9CA3AF';

interface PostRideModalProps {
  isVisible: boolean;
  rideId: string;
  driverName: string;
  driverRating: number;
  fare: number;
  tip: number;
  distance: number;
  duration: number;
  pickupAddress: string;
  destinationAddress: string;
  onClose: () => void;
  onRatingSubmitted?: () => void;
}

export function PostRideModal({
  isVisible,
  rideId,
  driverName,
  driverRating,
  fare,
  tip,
  distance,
  duration,
  pickupAddress,
  destinationAddress,
  onClose,
  onRatingSubmitted,
}: PostRideModalProps) {
  const [ratingStars, setRatingStars] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showReceipt, setShowReceipt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const FEEDBACK_TAGS = [
    'Driver was friendly',
    'Clean vehicle',
    'Good route',
    'Safe driving',
    'Excellent service',
  ];

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmitRating = async () => {
    setIsSubmitting(true);
    try {
      await firestoreDB.update(COLLECTIONS.RIDES, rideId, {
        rider_rating: ratingStars,
        rider_feedback: feedback,
        rider_feedback_tags: selectedTags,
        rated_at: new Date().toISOString(),
      });
      onRatingSubmitted?.();
      Alert.alert('Thank you!', 'Your rating has been submitted.');
      setTimeout(() => onClose(), 500);
    } catch (err) {
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareReceipt = async () => {
    try {
      const receiptText = `HY3N Receipt\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nRide ID: ${rideId}\nDriver: ${driverName}\nRating: ${driverRating.toFixed(1)} ⭐\n\nFrom: ${pickupAddress}\nTo: ${destinationAddress}\n\nDistance: ${distance.toFixed(1)} km\nDuration: ${duration} min\n\nFare: GH₵${fare.toFixed(2)}\nTip: GH₵${tip.toFixed(2)}\nTotal: GH₵${(fare + tip).toFixed(2)}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nThank you for riding with HY3N!`;

      await Share.share({
        message: receiptText,
        title: 'HY3N Receipt',
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  return (
    <Modal visible={isVisible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: CARD, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
          <ScrollView contentContainerStyle={{ padding: 24 }} showsVerticalScrollIndicator={false}>
            {!showReceipt ? (
              <>
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  <Text style={{ color: TEXT, fontSize: 20, fontWeight: '800', marginBottom: 8 }}>
                    How was your ride?
                  </Text>
                  <Text style={{ color: MUTED, fontSize: 13, marginBottom: 16 }}>
                    Rate {driverName} and help us improve
                  </Text>

                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <TouchableOpacity
                        key={star}
                        onPress={() => setRatingStars(star)}
                        style={{ padding: 8 }}
                      >
                        <MaterialIcons
                          name={star <= ratingStars ? 'star' : 'star-outline'}
                          size={40}
                          color={star <= ratingStars ? GOLD : MUTED}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
                    {[
                      { emoji: '😢', value: 1 },
                      { emoji: '😕', value: 2 },
                      { emoji: '😐', value: 3 },
                      { emoji: '🙂', value: 4 },
                      { emoji: '😍', value: 5 },
                    ].map(({ emoji, value }) => (
                      <TouchableOpacity
                        key={value}
                        onPress={() => setRatingStars(value)}
                        style={{ opacity: ratingStars === value ? 1 : 0.4 }}
                      >
                        <Text style={{ fontSize: 32 }}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14, marginBottom: 10 }}>
                    What went well?
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {FEEDBACK_TAGS.map(tag => (
                      <TouchableOpacity
                        key={tag}
                        onPress={() => toggleTag(tag)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 20,
                          backgroundColor: selectedTags.includes(tag) ? GREEN : BORDER,
                        }}
                      >
                        <Text
                          style={{
                            color: selectedTags.includes(tag) ? '#fff' : MUTED,
                            fontSize: 12,
                            fontWeight: '500',
                          }}
                        >
                          {tag}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14, marginBottom: 8 }}>
                    Additional comments
                  </Text>
                  <TextInput
                    value={feedback}
                    onChangeText={setFeedback}
                    placeholder="Share your experience..."
                    placeholderTextColor={MUTED}
                    multiline
                    numberOfLines={4}
                    style={{
                      backgroundColor: BG,
                      borderRadius: 12,
                      padding: 12,
                      color: TEXT,
                      fontSize: 13,
                      borderWidth: 1,
                      borderColor: BORDER,
                    }}
                  />
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setShowReceipt(true)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: CARD,
                      borderWidth: 1,
                      borderColor: BORDER,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>
                      View Receipt
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSubmitRating}
                    disabled={isSubmitting}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: GREEN,
                      alignItems: 'center',
                      opacity: isSubmitting ? 0.6 : 1,
                    }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                        Submit Rating
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={{ marginBottom: 24 }}>
                  <Text style={{ color: TEXT, fontSize: 18, fontWeight: '800', marginBottom: 16, textAlign: 'center' }}>
                    Receipt
                  </Text>

                  <View style={{ backgroundColor: BG, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: BORDER }}>
                    <View style={{ alignItems: 'center', marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                      <Text style={{ color: GOLD, fontSize: 16, fontWeight: '800', letterSpacing: 1 }}>
                        HY3N
                      </Text>
                      <Text style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>
                        Ride Receipt
                      </Text>
                    </View>

                    <View style={{ marginBottom: 16 }}>
                      <ReceiptRow label="Ride ID" value={rideId.slice(0, 8)} />
                      <ReceiptRow label="Driver" value={driverName} />
                      <ReceiptRow label="Rating" value={`${driverRating.toFixed(1)} ⭐`} />
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 16, marginBottom: 16 }}>
                      <ReceiptRow label="From" value={pickupAddress} />
                      <ReceiptRow label="To" value={destinationAddress} />
                      <ReceiptRow label="Distance" value={`${distance.toFixed(1)} km`} />
                      <ReceiptRow label="Duration" value={`${duration} min`} />
                    </View>

                    <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 16 }}>
                      <ReceiptRow label="Fare" value={`GH₵${fare.toFixed(2)}`} />
                      <ReceiptRow label="Tip" value={`GH₵${tip.toFixed(2)}`} valueColor={GOLD} />
                      <View style={{ borderTopWidth: 1, borderTopColor: BORDER, marginTop: 8, paddingTop: 8 }}>
                        <ReceiptRow
                          label="Total"
                          value={`GH₵${(fare + tip).toFixed(2)}`}
                          valueColor={GOLD}
                          bold
                        />
                      </View>
                    </View>

                    <View style={{ alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: BORDER }}>
                      <Text style={{ color: MUTED, fontSize: 11, textAlign: 'center' }}>
                        Thank you for riding with HY3N!
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setShowReceipt(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: CARD,
                      borderWidth: 1,
                      borderColor: BORDER,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: TEXT, fontWeight: '600', fontSize: 14 }}>
                      Back
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleShareReceipt}
                    style={{
                      flex: 1,
                      paddingVertical: 14,
                      borderRadius: 12,
                      backgroundColor: GOLD,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <MaterialIcons name="share" size={16} color="#000" />
                    <Text style={{ color: '#000', fontWeight: '700', fontSize: 14 }}>
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ReceiptRow({
  label,
  value,
  valueColor,
  bold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
      <Text style={{ color: MUTED, fontSize: 12, fontWeight: bold ? '600' : '400' }}>
        {label}
      </Text>
      <Text style={{ color: valueColor || TEXT, fontSize: 12, fontWeight: bold ? '700' : '500' }}>
        {value}
      </Text>
    </View>
  );
}
