import { Injectable } from '@nestjs/common';
import { Message, PermissionsBitField, Role } from 'discord.js';
import { RolesService } from '../../roles/roles.service';

@Injectable()
export class RolesCommands {
  constructor(private readonly rolesService: RolesService) {}

  private readonly roles = [
    { name: 'NA', type: 1 },
    { name: 'EU', type: 1 },
    { name: 'ASIA', type: 1 },
    { name: 'OCEA', type: 1 },
    { name: 'SA', type: 1 },
  ];

  async onInitRole(message: Message): Promise<void> {
    if (!(await this.isAdmin(message))) {
      return;
    }

    const createdRoles: string[] = [];
    const updatedRoles: string[] = [];

    for (const roleInfo of this.roles) {
      let role = message.guild.roles.cache.find(
        (r) => r.name === roleInfo.name,
      );

      if (!role) {
        role = await message.guild.roles.create({ name: roleInfo.name });
        createdRoles.push(roleInfo.name);
      } else {
        updatedRoles.push(roleInfo.name);
      }

      await this.upsertRoleInDatabase(role, roleInfo.type);
    }

    const responseMessage = this.generateResponseMessage(
      createdRoles,
      updatedRoles,
    );
    await message.reply(responseMessage);
  }

  private async upsertRoleInDatabase(role: Role, type: number): Promise<void> {
    await this.rolesService.upsertRole(role.name, role.id, type);
  }

  private generateResponseMessage(
    createdRoles: string[],
    updatedRoles: string[],
  ): string {
    let message = 'Mandatory roles have been processed:\n';

    if (createdRoles.length > 0) {
      message += `Created roles: ${createdRoles.join(', ')}\n`;
    }

    if (updatedRoles.length > 0) {
      message += `Updated roles: ${updatedRoles.join(', ')}`;
    }

    return message;
  }

  async onRoleRemove(message: Message): Promise<void> {
    if (!(await this.isAdmin(message))) {
      return;
    }

    const args = message.content.split(' ').slice(2);

    if (args.length === 0) {
      await message.reply(
        'Usage: !role remove all OR !role remove @role1 @role2 ...',
      );
      return;
    }

    if (args[0].toLowerCase() === 'all') {
      await this.removeAllRoles(message);
    } else {
      await this.removeSpecificRoles(message, args);
    }
  }

  private async removeAllRoles(message: Message): Promise<void> {
    try {
      const members = await message.guild.members.fetch();
      let removedCount = 0;

      for (const [, member] of members) {
        if (member.roles.cache.size > 1) {
          // Keep the @everyone role
          await member.roles.set([]);
          removedCount++;
        }
      }

      await message.reply(`Removed all roles from ${removedCount} members.`);
    } catch (error) {
      console.error('Error removing all roles:', error);
      await message.reply('An error occurred while removing all roles.');
    }
  }

  private async removeSpecificRoles(
    message: Message,
    args: string[],
  ): Promise<void> {
    const rolesToRemove = message.mentions.roles;

    if (rolesToRemove.size === 0) {
      await message.reply('Please mention the roles you want to remove.');
      return;
    }

    try {
      const members = await message.guild.members.fetch();
      let removedCount = 0;

      for (const [, member] of members) {
        const memberRoles = member.roles.cache;
        const rolesToRemoveFromMember = memberRoles.filter((role) =>
          rolesToRemove.has(role.id),
        );

        if (rolesToRemoveFromMember.size > 0) {
          await member.roles.remove(rolesToRemoveFromMember);
          removedCount++;
        }
      }

      const roleNames = rolesToRemove.map((role) => role.name).join(', ');
      await message.reply(
        `Removed roles (${roleNames}) from ${removedCount} members.`,
      );
    } catch (error) {
      console.error('Error removing specific roles:', error);
      await message.reply(
        'An error occurred while removing the specified roles.',
      );
    }
  }

  async onRoleDelete(message: Message): Promise<void> {
    if (!(await this.isAdmin(message))) {
      return;
    }

    const args = message.content.split(' ').slice(2);

    if (args.length === 0) {
      await message.reply(
        'Usage: !role delete all OR !role delete @role1 @role2 ...',
      );
      return;
    }

    if (args[0].toLowerCase() === 'all') {
      await this.deleteAllRoles(message);
    } else {
      await this.deleteSpecificRoles(message, args);
    }
  }

  private async deleteAllRoles(message: Message): Promise<void> {
    try {
      const roles = message.guild.roles.cache.filter(
        (role) => !role.managed && role.name !== '@everyone',
      );
      let deletedCount = 0;

      for (const [, role] of roles) {
        await role.delete();
        deletedCount++;
      }

      await message.reply(`Deleted ${deletedCount} roles.`);
    } catch (error) {
      console.error('Error deleting all roles:', error);
      await message.reply('An error occurred while deleting all roles.');
    }
  }

  private async deleteSpecificRoles(
    message: Message,
    args: string[],
  ): Promise<void> {
    const rolesToDelete = message.mentions.roles;

    if (rolesToDelete.size === 0) {
      await message.reply('Please mention the roles you want to delete.');
      return;
    }

    try {
      let deletedCount = 0;

      for (const [, role] of rolesToDelete) {
        if (!role.managed && role.name !== '@everyone') {
          await role.delete();
          deletedCount++;
        }
      }

      const roleNames = rolesToDelete.map((role) => role.name).join(', ');
      await message.reply(`Deleted ${deletedCount} roles: ${roleNames}`);
    } catch (error) {
      console.error('Error deleting specific roles:', error);
      await message.reply(
        'An error occurred while deleting the specified roles.',
      );
    }
  }

  private async isAdmin(message: Message): Promise<boolean> {
    return message.member.permissions.has(
      PermissionsBitField.Flags.Administrator,
    );
  }

  // Include other helper methods as needed
}
