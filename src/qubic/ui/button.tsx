'use client';

import { Button as HeroUIButton, ButtonProps as HeroUIButtonProps } from "@heroui/react";
import React from "react";

export interface ButtonProps extends Omit<HeroUIButtonProps, 'children'> {
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = (props) => {
  return <HeroUIButton {...props}>{props.children}</HeroUIButton>;
};

