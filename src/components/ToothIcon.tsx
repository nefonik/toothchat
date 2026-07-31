import React from 'react';

interface ToothIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

export const ToothIcon: React.FC<ToothIconProps> = ({ size = 24, className = '', ...props }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d="M7 3C4.5 3 3 5 3 8C3 11.5 4.5 14 6 17C7 19 8 21.5 9 21.5C10 21.5 10.5 19 11 17.5C11.5 16 12.5 16 13 17.5C13.5 19 14 21.5 15 21.5C16 21.5 17 19 18 17C19.5 14 21 11.5 21 8C21 5 19.5 3 17 3C14.5 3 13.5 5.5 12 5.5C10.5 5.5 9.5 3 7 3Z" />
      <path d="M8.5 8C8.5 8 9.5 7 12 7C14.5 7 15.5 8 15.5 8" opacity="0.6" />
    </svg>
  );
};
