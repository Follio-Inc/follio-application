'use client';

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import type { Skill, SkillGroup } from '@/types';

interface SkillsSectionProps {
  skills: Skill[];
  skillGroups: (SkillGroup & { skills: Skill[] })[];
  profileId: string;
  onUpdate: (skills: Skill[], skillGroups: (SkillGroup & { skills: Skill[] })[]) => void;
}

export function SkillsSection({ skills, skillGroups, profileId, onUpdate }: SkillsSectionProps) {
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillLevel, setNewSkillLevel] = useState<string>('');
  const [newGroupName, setNewGroupName] = useState('');

  const addSkill = () => {
    if (newSkillName.trim()) {
      const newSkill: Skill = {
        id: `temp-${Date.now()}`,
        profileId,
        name: newSkillName.trim(),
        level: newSkillLevel as any || null,
        yearsOfExp: null,
        groupId: null,
        source: 'MANUAL',
        sortOrder: skills.length,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      onUpdate([...skills, newSkill], skillGroups);
      setNewSkillName('');
      setNewSkillLevel('');
    }
  };

  const removeSkill = (skillId: string) => {
    onUpdate(skills.filter((s) => s.id !== skillId), skillGroups);
  };

  const addGroup = () => {
    if (newGroupName.trim()) {
      const newGroup: SkillGroup & { skills: Skill[] } = {
        id: `temp-${Date.now()}`,
        profileId,
        name: newGroupName.trim(),
        sortOrder: skillGroups.length,
        createdAt: new Date(),
        updatedAt: new Date(),
        skills: [],
      };
      onUpdate(skills, [...skillGroups, newGroup]);
      setNewGroupName('');
    }
  };

  const removeGroup = (groupId: string) => {
    // Move skills from deleted group to ungrouped
    const updatedSkills = skills.map((s) =>
      s.groupId === groupId ? { ...s, groupId: null } : s
    );
    onUpdate(updatedSkills, skillGroups.filter((g) => g.id !== groupId));
  };

  // Get ungrouped skills
  const ungroupedSkills = skills.filter((s) => !s.groupId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills</CardTitle>
        <CardDescription>Add your technical and professional skills</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add New Skill */}
        <div className="space-y-2">
          <Label>Add a skill</Label>
          <div className="flex gap-2">
            <Input
              value={newSkillName}
              onChange={(e) => setNewSkillName(e.target.value)}
              placeholder="e.g., TypeScript, React, Python"
              onKeyPress={(e) => e.key === 'Enter' && addSkill()}
              className="flex-1"
            />
            <Select value={newSkillLevel} onValueChange={setNewSkillLevel}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEGINNER">Beginner</SelectItem>
                <SelectItem value="INTERMEDIATE">Intermediate</SelectItem>
                <SelectItem value="ADVANCED">Advanced</SelectItem>
                <SelectItem value="EXPERT">Expert</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={addSkill} disabled={!newSkillName.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Skill Groups */}
        {skillGroups.map((group) => (
          <div key={group.id} className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-medium">{group.name}</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeGroup(group.id)}
                className="h-8 w-8 p-0"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
              {group.skills.length === 0 ? (
                <span className="text-sm text-muted-foreground">No skills in this group</span>
              ) : (
                group.skills.map((skill) => (
                  <Badge key={skill.id} variant="secondary" className="gap-1 pr-1">
                    {skill.name}
                    {skill.level && (
                      <span className="ml-1 text-xs opacity-70">
                        ({skill.level.toLowerCase()})
                      </span>
                    )}
                    <button
                      onClick={() => removeSkill(skill.id)}
                      className="ml-1 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>
        ))}

        {/* Ungrouped Skills */}
        {ungroupedSkills.length > 0 && (
          <div className="space-y-2">
            <Label className="text-base font-medium">
              {skillGroups.length > 0 ? 'Other Skills' : 'All Skills'}
            </Label>
            <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
              {ungroupedSkills.map((skill) => (
                <Badge key={skill.id} variant="secondary" className="gap-1 pr-1">
                  {skill.name}
                  {skill.level && (
                    <span className="ml-1 text-xs opacity-70">
                      ({skill.level.toLowerCase()})
                    </span>
                  )}
                  <button
                    onClick={() => removeSkill(skill.id)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {skills.length === 0 && (
          <div className="py-4 text-center text-muted-foreground">
            No skills added yet. Use the input above to add skills.
          </div>
        )}

        {/* Add Skill Group */}
        <div className="space-y-2 border-t pt-4">
          <Label>Create a skill group (optional)</Label>
          <div className="flex gap-2">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="e.g., Frontend, Backend, DevOps"
              onKeyPress={(e) => e.key === 'Enter' && addGroup()}
            />
            <Button onClick={addGroup} variant="outline" disabled={!newGroupName.trim()}>
              Add Group
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
