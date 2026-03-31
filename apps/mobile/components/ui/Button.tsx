import { TouchableOpacity, Text, ActivityIndicator } from 'react-native';

interface ButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
}

export function Button({
  onPress,
  title,
  loading = false,
  disabled = false,
  variant = 'primary',
  className = '',
}: ButtonProps) {
  const base = 'flex-row items-center justify-center rounded-xl py-3 px-6';
  const variants = {
    primary: 'bg-primary-500',
    secondary: 'bg-gray-100',
    ghost: 'bg-transparent',
  };
  const textVariants = {
    primary: 'text-white font-semibold text-base',
    secondary: 'text-gray-900 font-semibold text-base',
    ghost: 'text-primary-500 font-semibold text-base',
  };
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      className={`${base} ${variants[variant]} ${isDisabled ? 'opacity-50' : ''} ${className}`}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : '#6366f1'} />
      ) : (
        <Text className={textVariants[variant]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}
