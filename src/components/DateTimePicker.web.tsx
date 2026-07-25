import React from 'react';
import { View } from 'react-native';

interface DateTimePickerProps {
  value?: Date;
  mode?: 'date' | 'time' | 'datetime';
  display?: 'default' | 'spinner' | 'calendar' | 'clock' | 'compact' | 'inline';
  onChange?: (event: any, date?: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
  timeZoneName?: string;
  locale?: string;
  is24Hour?: boolean;
  minuteInterval?: 1 | 2 | 3 | 4 | 5 | 6 | 10 | 12 | 15 | 20 | 30;
  style?: any;
  disabled?: boolean;
  themeVariant?: 'light' | 'dark';
  testID?: string;
}

const DateTimePicker: React.FC<DateTimePickerProps> = ({ value, mode = 'date', onChange, maximumDate, minimumDate, style, disabled }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value ? new Date(e.target.value) : undefined;
    if (onChange) {
      onChange({ nativeEvent: { timestamp: date?.getTime() || Date.now() } }, date);
    }
  };

  const inputType = mode === 'time' ? 'time' : 'date';
  const formattedValue = value ? value.toISOString().slice(0, mode === 'time' ? 16 : 10) : '';

  return (
    <View style={[{ padding: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 5 }, style]}>
      <input
        type={inputType}
        value={formattedValue}
        onChange={handleChange}
        max={maximumDate?.toISOString().slice(0, 10)}
        min={minimumDate?.toISOString().slice(0, 10)}
        disabled={disabled}
        style={{
          fontSize: 16,
          padding: 8,
          borderWidth: 0,
          outlineWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          backgroundColor: 'transparent',
        }}
      />
    </View>
  );
};

export default DateTimePicker;