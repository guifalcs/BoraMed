import type { Meta, StoryObj } from '@storybook/angular';
import { moduleMetadata } from '@storybook/angular';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  Search,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Info,
  Loader,
} from 'lucide-angular';
import { UiIconComponent } from './ui-icon.component';

const meta: Meta<UiIconComponent> = {
  title: 'UI/Icon',
  component: UiIconComponent,
  decorators: [moduleMetadata({ imports: [UiIconComponent] })],
  tags: ['autodocs'],
  argTypes: {
    size: { control: { type: 'range', min: 12, max: 48, step: 2 } },
  },
};

export default meta;
type Story = StoryObj<UiIconComponent>;

export const Default: Story = {
  args: { icon: Eye, size: 18 },
};

export const Sizes: Story = {
  render: () => ({
    props: { Eye },
    template: `
      <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
        <app-ui-icon [icon]="Eye" [size]="12" />
        <app-ui-icon [icon]="Eye" [size]="16" />
        <app-ui-icon [icon]="Eye" [size]="18" />
        <app-ui-icon [icon]="Eye" [size]="24" />
        <app-ui-icon [icon]="Eye" [size]="32" />
        <app-ui-icon [icon]="Eye" [size]="48" />
      </div>
    `,
  }),
};

export const CommonIcons: Story = {
  render: () => ({
    props: { Eye, EyeOff, Lock, Mail, User, Search, ChevronDown, ChevronRight, Check, X, AlertCircle, Info, Loader },
    template: `
      <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;color:#0f172a">
        <app-ui-icon [icon]="Eye" [size]="20" />
        <app-ui-icon [icon]="EyeOff" [size]="20" />
        <app-ui-icon [icon]="Lock" [size]="20" />
        <app-ui-icon [icon]="Mail" [size]="20" />
        <app-ui-icon [icon]="User" [size]="20" />
        <app-ui-icon [icon]="Search" [size]="20" />
        <app-ui-icon [icon]="ChevronDown" [size]="20" />
        <app-ui-icon [icon]="ChevronRight" [size]="20" />
        <app-ui-icon [icon]="Check" [size]="20" />
        <app-ui-icon [icon]="X" [size]="20" />
        <app-ui-icon [icon]="AlertCircle" [size]="20" />
        <app-ui-icon [icon]="Info" [size]="20" />
        <app-ui-icon [icon]="Loader" [size]="20" />
      </div>
    `,
  }),
};

export const InheritedColor: Story = {
  render: () => ({
    props: { AlertCircle },
    template: `
      <div style="display:flex;gap:1rem">
        <span style="color:#059669"><app-ui-icon [icon]="AlertCircle" [size]="20" /></span>
        <span style="color:#dc2626"><app-ui-icon [icon]="AlertCircle" [size]="20" /></span>
        <span style="color:#d97706"><app-ui-icon [icon]="AlertCircle" [size]="20" /></span>
        <span style="color:#1e40af"><app-ui-icon [icon]="AlertCircle" [size]="20" /></span>
      </div>
    `,
  }),
};
