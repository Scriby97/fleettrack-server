import { IsEmail, IsString, MinLength, IsOptional, IsEnum, IsUUID } from 'class-validator';
import { UserRole } from '../enums/user-role.enum';

export class SignInDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

export class SignUpDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  metadata?: any;
}

export class RefreshTokenDto {
  @IsString()
  refresh_token: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;
}

export class UpdatePasswordDto {
  @IsString()
  @MinLength(6)
  new_password: string;
}

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
